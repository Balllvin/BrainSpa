from __future__ import annotations

import hashlib
import json
import re
import uuid
from collections import Counter
from pathlib import Path
from typing import Any

from fastapi import HTTPException
from packages.brainspa_training.handoff import validate_handoff

from .believer import (
    BELIEVER_CONTEXTS,
    BELIEVER_FAILURE_PRESSURES,
    BELIEVER_SYSTEM_PROMPT,
    BELIEVER_TOPICS,
    audit_believer_examples,
    believer_training_answer,
    build_believer_preference_pairs,
)
from .config import evidence_manifest_path, model_feedback_path, runtime_root
from .evidence_store import _read_claims, read_evidence_manifest
from .models import (
    DatasetEvidenceGate,
    DatasetGenerateRequest,
    DatasetGenerateResult,
    DatasetImportFeedbackResult,
    DatasetPreferencePairCreate,
    DatasetPreferencePairResult,
    DatasetProfile,
    DatasetRow,
    DatasetRowCreate,
    DatasetRowPage,
    DatasetRowPatch,
)
from .state import BrainSpaState
from .test_scenarios import PERSONA_SCENARIOS, scenario_generation_text

DATASET_KEYS = {"believer_seed"}
BELIEVER_SCENARIO_KEYS = tuple(s.key for s in PERSONA_SCENARIOS)
PACK_WITNESS_HEAVY = "witness-heavy"
PACK_IMPORT_FEEDBACK_ONLY = "import-feedback-only"


def dataset_artifact_dir(dataset_key: str) -> Path:
    return runtime_root() / "artifacts" / "datasets" / dataset_key


def train_jsonl_path(dataset_key: str) -> Path:
    return dataset_artifact_dir(dataset_key) / "dataset_sft_train.jsonl"


def preference_jsonl_path(dataset_key: str) -> Path:
    return dataset_artifact_dir(dataset_key) / "preference_pairs.jsonl"


def imported_feedback_ids_path(dataset_key: str) -> Path:
    return dataset_artifact_dir(dataset_key) / "imported_feedback_ids.json"


def read_evidence_gate() -> DatasetEvidenceGate:
    manifest = read_evidence_manifest()
    approved_count = manifest.approved_count
    ready = approved_count > 0
    message = (
        f"{approved_count} approved claim(s) ready for dataset generation."
        if ready
        else "No approved evidence yet. Approve claims in Evidence before generating rows."
    )
    return DatasetEvidenceGate(
        approved_count=approved_count,
        ready=ready,
        manifest_path=str(evidence_manifest_path()),
        message=message,
    )


def _require_dataset_key(dataset_key: str) -> None:
    if dataset_key not in DATASET_KEYS:
        raise HTTPException(status_code=404, detail=f"Unknown dataset: {dataset_key}")


def _load_approved_claims() -> list[dict[str, Any]]:
    return [item for item in _read_claims() if item.get("status") == "approved"]


def _load_rows(dataset_key: str) -> list[dict[str, Any]]:
    path = train_jsonl_path(dataset_key)
    if not path.exists():
        return []
    rows: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        rows.append(json.loads(line))
    return rows


def _write_rows(dataset_key: str, rows: list[dict[str, Any]]) -> Path:
    path = train_jsonl_path(dataset_key)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(json.dumps(item) for item in rows) + ("\n" if rows else ""), encoding="utf-8")
    return path


def _sync_dataset_state(dataset_key: str, rows: list[dict[str, Any]], manifest_path: Path | None = None) -> dict[str, Any]:
    state = BrainSpaState()
    existing = next((item for item in state.load()["datasets"] if item["key"] == dataset_key), None)
    payload = dict(existing or {})
    payload.update(
        {
            "key": dataset_key,
            "label": payload.get("label") or "Believer training set",
            "goal": payload.get("goal") or "Train Believer from approved evidence.",
            "row_count": len(rows),
            "artifact_path": str(manifest_path) if manifest_path else payload.get("artifact_path"),
        }
    )
    if len(rows) > 0 and not payload.get("warnings"):
        payload["state"] = payload.get("state") if payload.get("state") not in {None, "draft"} else "validated"
    return state.upsert_dataset(payload)


def _scenario_mix(rows: list[dict[str, Any]]) -> dict[str, int]:
    counts: Counter[str] = Counter()
    for row in rows:
        key = str((row.get("metadata") or {}).get("scenario_key") or "unknown")
        counts[key] += 1
    return dict(counts)


def _normalize_scenarios(request: DatasetGenerateRequest) -> list[str]:
    allowed = set(BELIEVER_SCENARIO_KEYS)
    selected = [key for key in request.scenarios if key in allowed]
    return selected or list(BELIEVER_SCENARIO_KEYS)


def _apply_pack_defaults(request: DatasetGenerateRequest) -> DatasetGenerateRequest:
    if request.pack == PACK_WITNESS_HEAVY:
        return request.model_copy(
            update={
                "example_count": 12,
                "scenarios": list(BELIEVER_SCENARIO_KEYS),
                "scenario_weights": {"witness": 6, "advice": 2, "counsel": 2, "daily-word": 2},
                "mix_even": False,
                "ground_in_evidence": True,
                "preview_only": False,
            }
        )
    return request


def _allocate_scenarios(request: DatasetGenerateRequest) -> list[str]:
    scenarios = _normalize_scenarios(request)
    count = request.example_count
    if request.mix_even or not request.scenario_weights:
        return [scenarios[index % len(scenarios)] for index in range(count)]
    pool: list[str] = []
    for key in scenarios:
        weight = max(0, int(request.scenario_weights.get(key, 0)))
        pool.extend([key] * weight)
    if not pool:
        return [scenarios[index % len(scenarios)] for index in range(count)]
    return [pool[index % len(pool)] for index in range(count)]


def _paraphrase_claim(text: str, index: int) -> str:
    cleaned = re.sub(r"\s+", " ", text.strip())
    if not cleaned:
        return "Speak with blunt faith, not generic assistant tone."
    openings = (
        "The line to hold",
        "What matters here",
        "Say it straight",
        "Ground this in",
    )
    opening = openings[index % len(openings)]
    words = cleaned.split()
    if len(words) > 20:
        cleaned = " ".join(words[:20]).rstrip(",.") + "."
    return f"{opening}: {cleaned}"


def _assistant_from_claim(paraphrase: str, scenario_key: str, context: str, pressure: str) -> str:
    core = paraphrase.split(":", 1)[-1].strip() if ":" in paraphrase else paraphrase.strip()
    core = core.rstrip(".")
    if scenario_key == "daily-word":
        short = core.split(".")[0]
        return f"{short}. Trust Christ for today — one obedient step."
    if scenario_key == "witness":
        return (
            f"{core} Faith is trust in the risen Christ, not a coping trick. "
            "Answer with patience; do not mock the question."
        )
    if scenario_key == "advice":
        return (
            f"{core} Name one concrete act of obedience for {context.lower()}; "
            f"refuse {pressure.lower()}."
        )
    return f"{core} Pray plainly about {context.lower()}, then obey what's clear before {pressure.lower()} wins."


def _claim_stem_for_scenario(
    claim: dict[str, Any],
    scenario_key: str,
    index: int,
    context: str,
    pressure: str,
) -> str:
    paraphrase = _paraphrase_claim(str(claim.get("text") or ""), index)
    setting = f"Context: {context}. Avoid {pressure}."
    if scenario_key == "counsel":
        return f"I'm wrestling with this: {paraphrase} {setting}"
    if scenario_key == "witness":
        return f"Someone pushed back with this idea: {paraphrase} {setting}"
    if scenario_key == "advice":
        return f"In this situation — {paraphrase} — what should I do? {setting}"
    if scenario_key == "daily-word":
        return f"{paraphrase} {setting}"
    return f"{paraphrase} {setting}"


def _build_grounded_row(
    index: int,
    scenario_key: str,
    claim: dict[str, Any],
) -> dict[str, Any]:
    context = BELIEVER_CONTEXTS[index % len(BELIEVER_CONTEXTS)]
    pressure = BELIEVER_FAILURE_PRESSURES[(index // len(BELIEVER_CONTEXTS)) % len(BELIEVER_FAILURE_PRESSURES)]
    stem = _claim_stem_for_scenario(claim, scenario_key, index, context, pressure)
    user_prompt = scenario_generation_text(scenario_key, stem)
    if scenario_key == "daily-word":
        user_prompt = f"{user_prompt} Focus for this row: {stem}"
    paraphrase = _paraphrase_claim(str(claim.get("text") or ""), index)
    assistant = _assistant_from_claim(paraphrase, scenario_key, context, pressure)
    claim_id = str(claim.get("id") or "")
    return {
        "id": f"believer-{index + 1:03d}",
        "messages": [
            {"role": "system", "content": BELIEVER_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
            {"role": "assistant", "content": assistant},
        ],
        "metadata": {
            "stage": "foundation",
            "scenario_key": scenario_key,
            "quality_target": "conviction_without_generic_padding",
            "failure_labels_to_watch": ["generic_advice", "weak_grounding", "evasive_conviction"],
            "source": "approved_evidence",
            "evidence_claim_ids": [claim_id] if claim_id else [],
        },
    }


def _build_template_row(index: int, scenario_key: str) -> dict[str, Any]:
    topic, base_prompt = BELIEVER_TOPICS[index % len(BELIEVER_TOPICS)]
    context = BELIEVER_CONTEXTS[index % len(BELIEVER_CONTEXTS)]
    pressure = BELIEVER_FAILURE_PRESSURES[(index // len(BELIEVER_CONTEXTS)) % len(BELIEVER_FAILURE_PRESSURES)]
    stem = f"{base_prompt} Context: {context}. Pressure to avoid: {pressure}."
    user_prompt = scenario_generation_text(scenario_key, stem)
    if scenario_key == "daily-word":
        user_prompt = f"{user_prompt} Focus for this row: {stem}"
        assistant = believer_training_answer("prayer", context, pressure)
        if len(assistant.split(".")) > 3:
            parts = assistant.split(".")
            assistant = ".".join(parts[:2]).strip() + "."
    elif scenario_key == "witness":
        assistant = believer_training_answer("witness", context, pressure)
    elif scenario_key == "advice":
        assistant = believer_training_answer(topic, context, pressure)
    else:
        assistant = believer_training_answer(topic, context, pressure)
    return {
        "id": f"believer-{index + 1:03d}",
        "messages": [
            {"role": "system", "content": BELIEVER_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
            {"role": "assistant", "content": assistant},
        ],
        "metadata": {
            "stage": "foundation",
            "scenario_key": scenario_key,
            "quality_target": "conviction_without_generic_padding",
            "failure_labels_to_watch": ["generic_advice", "weak_grounding", "evasive_conviction"],
            "source": "template",
            "evidence_claim_ids": [],
        },
    }


def _build_examples(request: DatasetGenerateRequest) -> tuple[list[dict[str, Any]], list[str]]:
    warnings: list[str] = []
    scenario_plan = _allocate_scenarios(request)
    claims = _load_approved_claims() if request.ground_in_evidence else []
    examples: list[dict[str, Any]] = []

    if request.ground_in_evidence and not claims:
        raise HTTPException(
            status_code=400,
            detail="Ground in approved evidence is on but no approved claims exist.",
        )

    for index, scenario_key in enumerate(scenario_plan):
        if request.ground_in_evidence:
            claim = claims[index % len(claims)]
            examples.append(_build_grounded_row(index, scenario_key, claim))
        else:
            examples.append(_build_template_row(index, scenario_key))

    if not request.ground_in_evidence:
        warnings.append(
            "Template fallback only — rows are not grounded in approved claims. "
            "Turn on “Ground in approved evidence” for claim-backed rows."
        )
    return examples, warnings


def list_dataset_rows(dataset_key: str, offset: int = 0, limit: int = 50) -> DatasetRowPage:
    _require_dataset_key(dataset_key)
    rows = _load_rows(dataset_key)
    window = rows[offset : offset + limit]
    return DatasetRowPage(
        dataset_key=dataset_key,
        total=len(rows),
        offset=offset,
        limit=limit,
        rows=[_row_to_public(item) for item in window],
    )


def _row_to_public(item: dict[str, Any]) -> DatasetRow:
    messages = item.get("messages") or []
    user_content = next((m.get("content", "") for m in messages if m.get("role") == "user"), "")
    assistant_content = next((m.get("content", "") for m in reversed(messages) if m.get("role") == "assistant"), "")
    metadata = item.get("metadata") or {}
    return DatasetRow(
        id=str(item.get("id") or ""),
        user_prompt=user_content,
        assistant_answer=assistant_content,
        scenario_key=str(metadata.get("scenario_key") or ""),
        failure_labels=list(metadata.get("failure_labels_to_watch") or []),
        source=str(metadata.get("source") or "generated"),
        metadata=metadata,
    )


def create_dataset_row(dataset_key: str, body: DatasetRowCreate) -> DatasetRow:
    _require_dataset_key(dataset_key)
    if body.scenario_key not in BELIEVER_SCENARIO_KEYS:
        raise HTTPException(status_code=400, detail=f"Unknown scenario: {body.scenario_key}")
    rows = _load_rows(dataset_key)
    row_id = f"believer-manual-{uuid.uuid4().hex[:8]}"
    item = {
        "id": row_id,
        "messages": [
            {"role": "system", "content": BELIEVER_SYSTEM_PROMPT},
            {"role": "user", "content": body.user_prompt.strip()},
            {"role": "assistant", "content": body.assistant_answer.strip()},
        ],
        "metadata": {
            "scenario_key": body.scenario_key,
            "failure_labels_to_watch": body.failure_labels,
            "source": "manual",
            "evidence_claim_ids": body.evidence_claim_ids,
        },
    }
    rows.append(item)
    _write_rows(dataset_key, rows)
    manifest = dataset_artifact_dir(dataset_key) / "sft_handoff.json"
    _sync_dataset_state(dataset_key, rows, manifest if manifest.exists() else None)
    return _row_to_public(item)


def patch_dataset_row(dataset_key: str, row_id: str, patch: DatasetRowPatch) -> DatasetRow:
    _require_dataset_key(dataset_key)
    rows = _load_rows(dataset_key)
    index = next((i for i, item in enumerate(rows) if item.get("id") == row_id), None)
    if index is None:
        raise HTTPException(status_code=404, detail=f"Row not found: {row_id}")
    item = rows[index]
    messages = item.setdefault("messages", [])
    if patch.user_prompt is not None:
        for message in messages:
            if message.get("role") == "user":
                message["content"] = patch.user_prompt
    if patch.assistant_answer is not None:
        for message in messages:
            if message.get("role") == "assistant":
                message["content"] = patch.assistant_answer
    metadata = item.setdefault("metadata", {})
    if patch.failure_labels is not None:
        metadata["failure_labels_to_watch"] = patch.failure_labels
    rows[index] = item
    _write_rows(dataset_key, rows)
    manifest = dataset_artifact_dir(dataset_key) / "sft_handoff.json"
    _sync_dataset_state(dataset_key, rows, manifest if manifest.exists() else None)
    return _row_to_public(item)


def delete_dataset_row(dataset_key: str, row_id: str) -> None:
    _require_dataset_key(dataset_key)
    rows = _load_rows(dataset_key)
    next_rows = [item for item in rows if item.get("id") != row_id]
    if len(next_rows) == len(rows):
        raise HTTPException(status_code=404, detail=f"Row not found: {row_id}")
    _write_rows(dataset_key, next_rows)
    manifest = dataset_artifact_dir(dataset_key) / "sft_handoff.json"
    _sync_dataset_state(dataset_key, next_rows, manifest if manifest.exists() else None)


def add_manual_preference_pair(dataset_key: str, body: DatasetPreferencePairCreate) -> DatasetPreferencePairResult:
    _require_dataset_key(dataset_key)
    pair_id = f"manual-{uuid.uuid4().hex[:8]}"
    pair = {
        "id": pair_id,
        "prompt": body.prompt.strip(),
        "chosen": body.chosen.strip(),
        "rejected": body.rejected.strip(),
        "failure_labels": body.failure_labels or ["manual_correction"],
        "comment": "Manual preference pair.",
        "metadata": {"source": "manual", "scenario_key": body.scenario_key},
    }
    _append_preference_pairs(dataset_key, [pair])
    return DatasetPreferencePairResult(
        dataset_key=dataset_key,
        pair_id=pair_id,
        message="Saved preference pair — rebuild adapter in Tune to apply.",
    )


def generate_believer_dataset(request: DatasetGenerateRequest, *, dataset_key: str = "believer_seed") -> DatasetGenerateResult:
    request = _apply_pack_defaults(request)

    if request.pack == PACK_IMPORT_FEEDBACK_ONLY:
        import_result = import_test_feedback(dataset_key)
        state = BrainSpaState()
        dataset = next((d for d in state.datasets() if d.key == dataset_key), None)
        return DatasetGenerateResult(
            dataset=dataset or DatasetProfile(
                key=dataset_key,
                label="Believer training set",
                goal=request.goal,
                state="draft",
                quality_notes=[],
                warnings=[],
                row_count=0,
                artifact_path=None,
            ),
            warnings=[],
            quality=[import_result.message],
            preview_only=False,
            scenario_mix={},
            grounded_in_evidence=False,
        )

    gate: DatasetEvidenceGate | None = None
    if request.ground_in_evidence:
        gate = read_evidence_gate()
        if not gate.ready:
            raise HTTPException(status_code=400, detail=gate.message)

    examples, extra_warnings = _build_examples(request)
    mix = _scenario_mix(examples)
    preview_samples = [_row_to_public(item) for item in examples[:2]]

    if request.preview_only:
        return DatasetGenerateResult(
            dataset=DatasetProfile(
                key=dataset_key,
                label="Believer training set",
                goal=request.goal,
                state="draft",
                quality_notes=[],
                warnings=extra_warnings,
                row_count=len(examples),
                artifact_path=None,
            ),
            preview_only=True,
            preview_samples=preview_samples,
            scenario_mix=mix,
            grounded_in_evidence=request.ground_in_evidence,
            evidence_gate=gate,
            warnings=extra_warnings,
        )

    artifact_dir = dataset_artifact_dir(dataset_key)
    artifact_dir.mkdir(parents=True, exist_ok=True)
    examples_path = _write_rows(dataset_key, examples)
    preference_pairs = build_believer_preference_pairs(examples)
    preference_path = preference_jsonl_path(dataset_key)
    preference_path.write_text("\n".join(json.dumps(item) for item in preference_pairs) + "\n", encoding="utf-8")
    manifest = {
        "export_kind": "brain_spa_sft_handoff",
        "schema_version": "brain_spa_handoff",
        "project_key": request.project_key,
        "dataset_key": dataset_key,
        "goal": request.goal,
        "preferred_model": "HuggingFaceTB/SmolLM2-360M-Instruct",
        "train_path": str(examples_path),
        "preference_pairs_path": str(preference_path),
        "row_count": len(examples),
        "approved_evidence_count": gate.approved_count if gate else 0,
        "grounded_in_evidence": request.ground_in_evidence,
        "scenario_mix": mix,
    }
    manifest_path = artifact_dir / "sft_handoff.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    quality, warnings = audit_believer_examples(examples)
    warnings.extend(extra_warnings)
    warnings.extend(validate_handoff(manifest))
    updated = _sync_dataset_state(dataset_key, examples, manifest_path)
    updated["quality_notes"] = quality
    updated["warnings"] = warnings
    updated["state"] = "validated" if not warnings else "draft"
    state = BrainSpaState()
    state.upsert_dataset(updated)
    return DatasetGenerateResult(
        dataset=DatasetProfile(**updated),
        examples_path=str(examples_path),
        manifest_path=str(manifest_path),
        preference_pairs_path=str(preference_path),
        quality=quality,
        warnings=warnings,
        evidence_gate=gate,
        preview_only=False,
        preview_samples=[],
        scenario_mix=mix,
        grounded_in_evidence=request.ground_in_evidence,
    )


def _feedback_record_id(record: dict[str, Any]) -> str:
    for key in ("feedback_id", "id"):
        if record.get(key):
            return str(record[key])
    parts = [
        str(record.get("source") or ""),
        str(record.get("model_key") or ""),
        str(record.get("scenario_key") or ""),
        str(record.get("harness_message_id") or ""),
        str(record.get("feedback_message_id") or ""),
        str(record.get("prompt") or ""),
        str(record.get("feedback") or ""),
    ]
    digest = hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()[:16]
    return f"fb-{digest}"


def _load_imported_feedback_ids(dataset_key: str) -> set[str]:
    path = imported_feedback_ids_path(dataset_key)
    if not path.exists():
        return set()
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return set()
    if isinstance(data, list):
        return {str(item) for item in data}
    return {str(item) for item in data.get("ids", [])}


def _save_imported_feedback_ids(dataset_key: str, ids: set[str]) -> None:
    path = imported_feedback_ids_path(dataset_key)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(sorted(ids), indent=2) + "\n", encoding="utf-8")


def _append_preference_pairs(dataset_key: str, pairs: list[dict[str, Any]]) -> None:
    path = preference_jsonl_path(dataset_key)
    path.parent.mkdir(parents=True, exist_ok=True)
    existing = path.read_text(encoding="utf-8") if path.exists() else ""
    block = "\n".join(json.dumps(item) for item in pairs)
    if existing and not existing.endswith("\n"):
        existing += "\n"
    path.write_text(existing + (block + "\n" if block else ""), encoding="utf-8")


def import_test_feedback(dataset_key: str) -> DatasetImportFeedbackResult:
    _require_dataset_key(dataset_key)
    feedback_file = model_feedback_path()
    if not feedback_file.exists():
        return DatasetImportFeedbackResult(
            dataset_key=dataset_key,
            imported_count=0,
            skipped_duplicates=0,
            pending_feedback_count=0,
            message="No Test feedback saved yet.",
        )

    records = []
    for line in feedback_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            records.append(json.loads(line))
        except json.JSONDecodeError:
            continue

    imported_ids = _load_imported_feedback_ids(dataset_key)
    new_pairs: list[dict[str, Any]] = []
    skipped = 0
    for record in records:
        feedback_text = str(record.get("feedback") or "").strip()
        rejected = str(record.get("answer") or "").strip()
        prompt = str(record.get("prompt") or "").strip()
        if not feedback_text or not rejected or not prompt:
            continue
        record_id = _feedback_record_id(record)
        if record_id in imported_ids:
            skipped += 1
            continue
        scenario_key = str(record.get("scenario_key") or "counsel")
        pair_id = f"{record_id}-preference"
        new_pairs.append(
            {
                "id": pair_id,
                "prompt": prompt,
                "chosen": feedback_text,
                "rejected": rejected,
                "failure_labels": ["test_miss", "user_correction"],
                "comment": "Imported from Test wrong-answer feedback.",
                "metadata": {
                    "source": "test_feedback",
                    "scenario_key": scenario_key,
                    "feedback_id": record_id,
                },
            }
        )
        imported_ids.add(record_id)

    if new_pairs:
        _append_preference_pairs(dataset_key, new_pairs)
        _save_imported_feedback_ids(dataset_key, imported_ids)

    pending = sum(
        1
        for record in records
        if str(record.get("feedback") or "").strip()
        and _feedback_record_id(record) not in imported_ids
    )
    message = (
        f"Imported {len(new_pairs)} correction(s) — rebuild adapter in Tune to apply."
        if new_pairs
        else "No new corrections to import."
    )
    return DatasetImportFeedbackResult(
        dataset_key=dataset_key,
        imported_count=len(new_pairs),
        skipped_duplicates=skipped,
        pending_feedback_count=pending,
        message=message,
    )
