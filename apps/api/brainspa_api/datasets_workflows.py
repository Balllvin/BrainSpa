from __future__ import annotations

import hashlib
import json
import uuid
from pathlib import Path
from typing import Any

from fastapi import HTTPException

from .config import evidence_manifest_path, model_feedback_path, runtime_root
from .evidence_store import _read_claims, read_evidence_manifest
from .models import (
    DatasetEvidenceGate,
    DatasetImportFeedbackResult,
    DatasetPreferencePairCreate,
    DatasetPreferencePairResult,
    DatasetRow,
    DatasetRowCreate,
    DatasetRowPage,
    DatasetRowPatch,
)
from .state import BrainSpaState

DATASET_KEYS: set[str] = set()


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
        f"{approved_count} approved claim(s) ready for a future text dataset."
        if ready
        else "No approved evidence yet. Approve claims in Evidence before creating a text dataset."
    )
    return DatasetEvidenceGate(
        approved_count=approved_count,
        ready=ready,
        manifest_path=str(evidence_manifest_path()),
        message=message,
    )


def _require_dataset_key(dataset_key: str) -> None:
    if dataset_key not in DATASET_KEYS:
        raise HTTPException(status_code=404, detail=f"Unknown text dataset: {dataset_key}")


def _load_rows(dataset_key: str) -> list[dict[str, Any]]:
    path = train_jsonl_path(dataset_key)
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def _write_rows(dataset_key: str, rows: list[dict[str, Any]]) -> Path:
    path = train_jsonl_path(dataset_key)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(json.dumps(item) for item in rows) + ("\n" if rows else ""), encoding="utf-8")
    return path


def _sync_dataset_state(dataset_key: str, rows: list[dict[str, Any]], artifact_path: Path | None = None) -> None:
    state = BrainSpaState()
    existing = next((item for item in state.load()["datasets"] if item["key"] == dataset_key), None)
    if not existing:
        return
    state.upsert_dataset(
        {
            **existing,
            "row_count": len(rows),
            "artifact_path": str(artifact_path) if artifact_path else existing.get("artifact_path"),
        }
    )


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


def create_dataset_row(dataset_key: str, body: DatasetRowCreate) -> DatasetRow:
    _require_dataset_key(dataset_key)
    rows = _load_rows(dataset_key)
    item = {
        "id": f"manual-{uuid.uuid4().hex[:8]}",
        "messages": [
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
    _sync_dataset_state(dataset_key, rows)
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
        _set_message(messages, "user", patch.user_prompt)
    if patch.assistant_answer is not None:
        _set_message(messages, "assistant", patch.assistant_answer)
    metadata = item.setdefault("metadata", {})
    if patch.failure_labels is not None:
        metadata["failure_labels_to_watch"] = patch.failure_labels
    rows[index] = item
    _write_rows(dataset_key, rows)
    _sync_dataset_state(dataset_key, rows)
    return _row_to_public(item)


def delete_dataset_row(dataset_key: str, row_id: str) -> None:
    _require_dataset_key(dataset_key)
    rows = _load_rows(dataset_key)
    next_rows = [item for item in rows if item.get("id") != row_id]
    if len(next_rows) == len(rows):
        raise HTTPException(status_code=404, detail=f"Row not found: {row_id}")
    _write_rows(dataset_key, next_rows)
    _sync_dataset_state(dataset_key, next_rows)


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
        message="Saved preference pair.",
    )


def import_test_feedback(dataset_key: str) -> DatasetImportFeedbackResult:
    _require_dataset_key(dataset_key)
    imported = _load_imported_feedback_ids(dataset_key)
    feedback_path = model_feedback_path()
    if not feedback_path.exists():
        return DatasetImportFeedbackResult(dataset_key=dataset_key, imported_count=0, skipped_count=0, message="No feedback to import.")

    pairs: list[dict[str, Any]] = []
    rows = _load_rows(dataset_key)
    skipped = 0
    for line in feedback_path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        record = json.loads(line)
        record_id = _feedback_record_id(record)
        if record_id in imported:
            skipped += 1
            continue
        prompt = str(record.get("prompt") or "")
        answer = str(record.get("answer") or "")
        feedback = str(record.get("feedback") or "")
        if not prompt or not answer or not feedback:
            skipped += 1
            continue
        rows.append(_feedback_to_row(record_id, record))
        pairs.append(_feedback_to_pair(record_id, record))
        imported.add(record_id)

    _write_rows(dataset_key, rows)
    _append_preference_pairs(dataset_key, pairs)
    imported_feedback_ids_path(dataset_key).write_text(json.dumps(sorted(imported), indent=2) + "\n", encoding="utf-8")
    _sync_dataset_state(dataset_key, rows)
    return DatasetImportFeedbackResult(
        dataset_key=dataset_key,
        imported_count=len(pairs),
        skipped_count=skipped,
        message=f"Imported {len(pairs)} feedback item(s).",
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
        source=str(metadata.get("source") or "manual"),
        metadata=metadata,
    )


def _set_message(messages: list[dict[str, Any]], role: str, content: str) -> None:
    for message in messages:
        if message.get("role") == role:
            message["content"] = content
            return
    messages.append({"role": role, "content": content})


def _append_preference_pairs(dataset_key: str, pairs: list[dict[str, Any]]) -> None:
    if not pairs:
        return
    path = preference_jsonl_path(dataset_key)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        for pair in pairs:
            handle.write(json.dumps(pair) + "\n")


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
    return {str(item) for item in data if item}


def _feedback_to_row(record_id: str, record: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": f"feedback-{record_id}",
        "messages": [
            {"role": "user", "content": str(record.get("prompt") or "")},
            {"role": "assistant", "content": str(record.get("feedback") or "")},
        ],
        "metadata": {
            "scenario_key": str(record.get("scenario_key") or ""),
            "failure_labels_to_watch": ["feedback_revision"],
            "source": "test_feedback",
            "original_answer": str(record.get("answer") or ""),
            "feedback_record_id": record_id,
        },
    }


def _feedback_to_pair(record_id: str, record: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": f"pref-{record_id}",
        "prompt": str(record.get("prompt") or ""),
        "chosen": str(record.get("feedback") or ""),
        "rejected": str(record.get("answer") or ""),
        "failure_labels": ["feedback_revision"],
        "comment": "Imported from test feedback.",
        "metadata": {"source": "test_feedback", "feedback_record_id": record_id},
    }


def approved_claim_count() -> int:
    return len([item for item in _read_claims() if item.get("status") == "approved"])
