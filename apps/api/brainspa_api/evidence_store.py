from __future__ import annotations

import json
import re
import uuid
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

from fastapi import HTTPException

from .config import (
    evidence_manifest_path,
    evidence_notes_path,
    ensure_runtime_dirs,
    source_claims_path,
)
from .models import (
    EvidenceApprovedClaimsResponse,
    EvidenceBulkApproveResult,
    EvidenceClaim,
    EvidenceClaimCreate,
    EvidenceClaimPatch,
    EvidenceClaimStatus,
    EvidenceIngestRequest,
    EvidenceIngestResult,
    EvidenceManifest,
    EvidenceModelSummary,
    EvidenceNotes,
    EvidenceSourceDetail,
    EvidenceSourceSummary,
    SourceProfile,
)
from .state import BrainSpaState, get_xai_api_key

DEFAULT_BEHAVIOR_FOCUS = "Specific target behavior backed by cited evidence before training rows are written."

MODEL_SLUG_TO_KEY: dict[str, str] = {"snake": "snake_policy"}
MODEL_KEY_TO_SLUG: dict[str, str] = {"snake_policy": "snake"}
MODEL_DISPLAY: dict[str, str] = {"snake": "Snake Policy", "snake_policy": "Snake Policy"}

ClaimStatus = Literal["pending", "approved", "rejected", "weak"]


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _read_json(path: Path, default: dict[str, Any]) -> dict[str, Any]:
    if not path.exists():
        return dict(default)
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return dict(default)
    return payload if isinstance(payload, dict) else dict(default)


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    ensure_runtime_dirs()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def _read_claims() -> list[dict[str, Any]]:
    path = source_claims_path()
    if not path.exists():
        return []
    claims: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            item = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(item, dict):
            claims.append(item)
    return claims


def _write_claims(claims: list[dict[str, Any]]) -> None:
    path = source_claims_path()
    ensure_runtime_dirs()
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = [json.dumps(item, ensure_ascii=False) for item in claims]
    path.write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")


def _load_notes() -> dict[str, Any]:
    return _read_json(
        evidence_notes_path(),
        {"behavior_focus": DEFAULT_BEHAVIOR_FOCUS, "sources": {}},
    )


def _save_notes(notes: dict[str, Any]) -> None:
    _write_json(evidence_notes_path(), notes)


def _model_slug(model: str) -> str:
    if model in MODEL_KEY_TO_SLUG:
        return MODEL_KEY_TO_SLUG[model]
    if model in MODEL_SLUG_TO_KEY:
        return model
    return model


def _model_key(model: str) -> str:
    return MODEL_SLUG_TO_KEY.get(model, model)


def _source_feeds_model(source: SourceProfile, model: str) -> bool:
    slug = _model_slug(model)
    key = _model_key(model)
    feeds = source.feeds_models or []
    return slug in feeds or key in feeds


def _source_keys_for_model(state: BrainSpaState, model: str) -> list[str]:
    return [source.key for source in state.sources() if source.active and _source_feeds_model(source, model)]


def _source_label_map(state: BrainSpaState) -> dict[str, str]:
    return {source.key: source.label for source in state.sources()}


def _feeds_model_labels(feeds_models: list[str]) -> list[str]:
    labels: list[str] = []
    for item in feeds_models:
        if item in MODEL_DISPLAY:
            label = MODEL_DISPLAY[item]
        elif item in MODEL_KEY_TO_SLUG:
            label = MODEL_DISPLAY.get(MODEL_KEY_TO_SLUG[item], item)
        else:
            continue
        if label not in labels:
            labels.append(label)
    return labels


def _count_claims(claims: list[dict[str, Any]], source_keys: set[str] | None = None) -> dict[str, int]:
    counts = {"pending_count": 0, "approved_count": 0, "rejected_count": 0, "weak_count": 0}
    for claim in claims:
        if source_keys is not None and claim.get("source_key") not in source_keys:
            continue
        status = str(claim.get("status") or "pending")
        if status == "approved":
            counts["approved_count"] += 1
        elif status == "rejected":
            counts["rejected_count"] += 1
        elif status == "weak":
            counts["weak_count"] += 1
        else:
            counts["pending_count"] += 1
    return counts


def _rebuild_manifest(claims: list[dict[str, Any]], notes: dict[str, Any], state: BrainSpaState) -> dict[str, Any]:
    approved = [item for item in claims if item.get("status") == "approved"]
    sources: dict[str, Any] = {}
    for claim in claims:
        key = str(claim.get("source_key") or "")
        if not key:
            continue
        bucket = sources.setdefault(
            key,
            {
                "pending_count": 0,
                "approved_count": 0,
                "rejected_count": 0,
                "weak_count": 0,
                "last_ingest_at": None,
            },
        )
        status = str(claim.get("status") or "pending")
        if status == "approved":
            bucket["approved_count"] += 1
        elif status == "rejected":
            bucket["rejected_count"] += 1
        elif status == "weak":
            bucket["weak_count"] += 1
        else:
            bucket["pending_count"] += 1
        ingest_at = claim.get("ingested_at")
        if ingest_at and (bucket["last_ingest_at"] is None or ingest_at > bucket["last_ingest_at"]):
            bucket["last_ingest_at"] = ingest_at

    for bucket in sources.values():
        bucket["ready_for_datasets"] = bucket["approved_count"] > 0

    models: dict[str, Any] = {}
    for source in state.sources():
        if not source.active:
            continue
        for feed in source.feeds_models or []:
            slug = _model_slug(feed)
            if slug not in models:
                models[slug] = {
                    "display_name": MODEL_DISPLAY.get(slug, slug.title()),
                    "source_keys": [],
                    "pending_count": 0,
                    "approved_count": 0,
                    "rejected_count": 0,
                    "weak_count": 0,
                }
            if source.key not in models[slug]["source_keys"]:
                models[slug]["source_keys"].append(source.key)

    for slug, bucket in models.items():
        keys = set(bucket["source_keys"])
        counts = _count_claims(claims, keys)
        bucket.update(counts)
        bucket["ready_for_datasets"] = bucket["approved_count"] > 0

    return {
        "version": 1,
        "updated_at": _utc_now(),
        "behavior_focus": notes.get("behavior_focus") or DEFAULT_BEHAVIOR_FOCUS,
        "artifact_dir": str(evidence_manifest_path().parent),
        "sources": sources,
        "models": models,
        "approved_claim_ids": [str(item["id"]) for item in approved if item.get("id")],
        "approved_count": len(approved),
    }


def _save_manifest(manifest: dict[str, Any]) -> None:
    _write_json(evidence_manifest_path(), manifest)


def _claim_model(item: dict[str, Any], labels: dict[str, str] | None = None) -> EvidenceClaim:
    source_key = str(item["source_key"])
    return EvidenceClaim(
        id=str(item["id"]),
        source_key=source_key,
        source_label=(labels or {}).get(source_key),
        text=str(item["text"]),
        citation=str(item.get("citation") or ""),
        status=item.get("status") or "pending",
        ingested_at=str(item.get("ingested_at") or ""),
        updated_at=str(item.get("updated_at") or ""),
        ingest_run_id=item.get("ingest_run_id"),
        manual=bool(item.get("manual")),
    )


def _source_for_key(state: BrainSpaState, source_key: str) -> SourceProfile:
    for source in state.sources():
        if source.key == source_key:
            return source
    raise HTTPException(status_code=404, detail=f"Unknown source: {source_key}")


def _persist_claims(claims: list[dict[str, Any]], state: BrainSpaState) -> dict[str, Any]:
    _write_claims(claims)
    notes = _load_notes()
    manifest = _rebuild_manifest(claims, notes, state)
    _save_manifest(manifest)
    return manifest


def _xai_extract_claims(source: SourceProfile, query: str | None) -> list[dict[str, str]]:
    api_key = get_xai_api_key()
    if not api_key:
        return []

    focus = query or DEFAULT_BEHAVIOR_FOCUS
    prompt = (
        f"Source label: {source.label}\n"
        f"Kind: {source.kind}\n"
        f"Provenance: {source.provenance}\n"
        f"Summary: {source.summary}\n"
        f"Behavior focus: {focus}\n\n"
        "Extract 3 to 5 specific, citable behavior claims suitable as training evidence. "
        "Each claim must be concrete (not 'be helpful'). "
        "Return ONLY a JSON array of objects with keys text and citation."
    )
    body = json.dumps(
        {
            "model": "grok-3-mini",
            "messages": [
                {"role": "system", "content": "You extract cited evidence claims as JSON only."},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.2,
        }
    ).encode("utf-8")
    request = urllib.request.Request(
        "https://api.x.ai/v1/chat/completions",
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except Exception:
        return []

    content = payload.get("choices", [{}])[0].get("message", {}).get("content", "")
    if not content:
        return []
    match = re.search(r"\[[\s\S]*\]", content)
    if not match:
        return []
    try:
        parsed = json.loads(match.group(0))
    except json.JSONDecodeError:
        return []
    if not isinstance(parsed, list):
        return []
    claims: list[dict[str, str]] = []
    for item in parsed:
        if not isinstance(item, dict):
            continue
        text = str(item.get("text") or "").strip()
        citation = str(item.get("citation") or source.provenance).strip()
        if text:
            claims.append({"text": text, "citation": citation})
    return claims


def _local_extract_claims(source: SourceProfile, query: str | None) -> list[dict[str, str]]:
    focus = query or DEFAULT_BEHAVIOR_FOCUS
    base = source.summary.strip()
    return [
        {
            "text": f"Answers should reflect: {base}",
            "citation": source.provenance,
        },
        {
            "text": f"Reject vague behavior claims; stay specific to: {focus}",
            "citation": source.provenance,
        },
        {
            "text": "Claims must name the behavior signal, not vague helpfulness.",
            "citation": source.provenance,
        },
    ]


def list_evidence_sources(state: BrainSpaState) -> list[EvidenceSourceSummary]:
    claims = _read_claims()
    notes = _load_notes()
    manifest = _rebuild_manifest(claims, notes, state)
    _save_manifest(manifest)
    summaries: list[EvidenceSourceSummary] = []
    for source in state.sources():
        if not source.active:
            continue
        bucket = manifest["sources"].get(source.key, {})
        feeds = list(source.feeds_models or [])
        summaries.append(
            EvidenceSourceSummary(
                key=source.key,
                label=source.label,
                kind=source.kind,
                summary=source.summary,
                provenance=source.provenance,
                feeds_models=feeds,
                feeds_model_labels=_feeds_model_labels(feeds),
                pending_count=int(bucket.get("pending_count", 0)),
                approved_count=int(bucket.get("approved_count", 0)),
                rejected_count=int(bucket.get("rejected_count", 0)),
                weak_count=int(bucket.get("weak_count", 0)),
                last_ingest_at=bucket.get("last_ingest_at"),
                ready_for_datasets=bool(bucket.get("ready_for_datasets")),
            )
        )
    return summaries


def get_model_evidence_summary(state: BrainSpaState, model_slug: str) -> EvidenceModelSummary:
    slug = _model_slug(model_slug)
    source_keys = _source_keys_for_model(state, slug)
    if not source_keys:
        raise HTTPException(status_code=404, detail=f"No sources feed model: {model_slug}")

    claims = _read_claims()
    notes = _load_notes()
    key_set = set(source_keys)
    counts = _count_claims(claims, key_set)
    return EvidenceModelSummary(
        model_slug=slug,
        display_name=MODEL_DISPLAY.get(slug, slug.title()),
        behavior_focus=notes.get("behavior_focus") or DEFAULT_BEHAVIOR_FOCUS,
        approved_count=counts["approved_count"],
        pending_count=counts["pending_count"],
        weak_count=counts["weak_count"],
        rejected_count=counts["rejected_count"],
        ready_for_datasets=counts["approved_count"] > 0,
        source_keys=source_keys,
    )


def get_evidence_source_detail(state: BrainSpaState, source_key: str) -> EvidenceSourceDetail:
    source = _source_for_key(state, source_key)
    notes = _load_notes()
    source_notes = notes.get("sources", {}).get(source_key, {})
    labels = _source_label_map(state)
    claims = [
        _claim_model(item, labels)
        for item in _read_claims()
        if item.get("source_key") == source_key
    ]
    return EvidenceSourceDetail(
        source=source,
        behavior_focus=notes.get("behavior_focus") or DEFAULT_BEHAVIOR_FOCUS,
        ingest_focus=source_notes.get("ingest_focus"),
        last_ingest_at=source_notes.get("last_ingest_at"),
        claims=claims,
        artifact_paths={
            "notes": str(evidence_notes_path()),
            "claims": str(source_claims_path()),
            "manifest": str(evidence_manifest_path()),
        },
    )


def list_evidence_claims(
    state: BrainSpaState,
    *,
    model: str | None = None,
    status: str | None = None,
    source_key: str | None = None,
) -> list[EvidenceClaim]:
    claims = _read_claims()
    labels = _source_label_map(state)

    if source_key:
        _source_for_key(state, source_key)
        claims = [item for item in claims if item.get("source_key") == source_key]
    elif model:
        keys = set(_source_keys_for_model(state, model))
        if not keys:
            raise HTTPException(status_code=404, detail=f"No sources feed model: {model}")
        claims = [item for item in claims if item.get("source_key") in keys]

    if status:
        if status not in {"pending", "approved", "rejected", "weak"}:
            raise HTTPException(status_code=400, detail=f"Invalid status filter: {status}")
        claims = [item for item in claims if item.get("status") == status]

    claims.sort(key=lambda item: (item.get("ingested_at") or "", item.get("id") or ""))
    return [_claim_model(item, labels) for item in claims]


def list_source_claims(state: BrainSpaState, source_key: str) -> list[EvidenceClaim]:
    return list_evidence_claims(state, source_key=source_key)


def create_evidence_claim(state: BrainSpaState, body: EvidenceClaimCreate) -> EvidenceClaim:
    source = _source_for_key(state, body.source_key)
    text = body.text.strip()
    citation = body.citation.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Claim text is required.")
    if not citation:
        raise HTTPException(status_code=400, detail="Citation is required.")

    now = _utc_now()
    record = {
        "id": f"claim_{uuid.uuid4().hex[:12]}",
        "source_key": source.key,
        "text": text,
        "citation": citation,
        "status": "pending",
        "ingested_at": now,
        "updated_at": now,
        "ingest_run_id": None,
        "manual": True,
    }
    claims = _read_claims()
    claims.append(record)
    _persist_claims(claims, state)
    labels = _source_label_map(state)
    return _claim_model(record, labels)


def start_source_ingest(state: BrainSpaState, source_key: str, request: EvidenceIngestRequest) -> EvidenceIngestResult:
    source = _source_for_key(state, source_key)
    run_id = f"ingest_{uuid.uuid4().hex[:12]}"
    now = _utc_now()
    ingest_focus = (request.query or "").strip() or DEFAULT_BEHAVIOR_FOCUS
    extracted = _xai_extract_claims(source, request.query)
    backend = "grok" if extracted else "local"
    if not extracted:
        extracted = _local_extract_claims(source, request.query)

    new_claims: list[dict[str, Any]] = []
    for item in extracted:
        new_claims.append(
            {
                "id": f"claim_{uuid.uuid4().hex[:12]}",
                "source_key": source_key,
                "text": item["text"],
                "citation": item["citation"],
                "status": "pending",
                "ingested_at": now,
                "updated_at": now,
                "ingest_run_id": run_id,
                "manual": False,
            }
        )

    all_claims = _read_claims()
    all_claims.extend(new_claims)
    _write_claims(all_claims)

    notes = _load_notes()
    if request.query:
        notes["behavior_focus"] = request.query.strip()
    notes.setdefault("sources", {})[source_key] = {
        "ingest_focus": ingest_focus,
        "last_ingest_at": now,
        "last_ingest_run_id": run_id,
        "last_ingest_backend": backend,
    }
    _save_notes(notes)
    manifest = _rebuild_manifest(all_claims, notes, state)
    _save_manifest(manifest)

    return EvidenceIngestResult(
        source_key=source_key,
        ingest_run_id=run_id,
        backend=backend,
        claims_added=len(new_claims),
        ingested_at=now,
        manifest_path=str(evidence_manifest_path()),
        claim_ids=[str(item["id"]) for item in new_claims],
        ingest_focus=ingest_focus,
    )


def patch_evidence_claim(state: BrainSpaState, claim_id: str, patch: EvidenceClaimPatch) -> EvidenceClaim:
    claims = _read_claims()
    found: dict[str, Any] | None = None
    for item in claims:
        if item.get("id") == claim_id:
            found = item
            break
    if not found:
        raise HTTPException(status_code=404, detail=f"Unknown claim: {claim_id}")

    current_status = str(found.get("status") or "pending")
    fields = patch.model_dump(exclude_unset=True)

    if patch.text is not None or patch.citation is not None:
        if current_status != "pending":
            raise HTTPException(status_code=400, detail="Only pending claims can be edited.")
        if patch.text is not None:
            text = patch.text.strip()
            if not text:
                raise HTTPException(status_code=400, detail="Claim text cannot be empty.")
            found["text"] = text
        if patch.citation is not None:
            citation = patch.citation.strip()
            if not citation:
                raise HTTPException(status_code=400, detail="Citation cannot be empty.")
            found["citation"] = citation

    if patch.status is not None:
        found["status"] = patch.status

    if patch.note:
        found["review_note"] = patch.note

    found["updated_at"] = _utc_now()
    _persist_claims(claims, state)
    labels = _source_label_map(state)
    return _claim_model(found, labels)


def delete_evidence_claim(state: BrainSpaState, claim_id: str) -> dict[str, bool]:
    claims = _read_claims()
    kept: list[dict[str, Any]] = []
    removed = False
    for item in claims:
        if item.get("id") == claim_id:
            if str(item.get("status") or "pending") != "pending":
                raise HTTPException(status_code=400, detail="Only pending claims can be deleted.")
            removed = True
            continue
        kept.append(item)
    if not removed:
        raise HTTPException(status_code=404, detail=f"Unknown claim: {claim_id}")
    _persist_claims(kept, state)
    return {"ok": True}


def bulk_approve_pending_with_citation(
    state: BrainSpaState,
    model: str | None = None,
) -> EvidenceBulkApproveResult:
    claims = _read_claims()
    source_keys: set[str] | None = None
    if model:
        keys = _source_keys_for_model(state, model)
        if not keys:
            raise HTTPException(status_code=404, detail=f"No sources feed model: {model}")
        source_keys = set(keys)

    approved_ids: list[str] = []
    skipped = 0
    for item in claims:
        if item.get("status") != "pending":
            continue
        if source_keys is not None and item.get("source_key") not in source_keys:
            continue
        citation = str(item.get("citation") or "").strip()
        if not citation:
            skipped += 1
            continue
        item["status"] = "approved"
        item["updated_at"] = _utc_now()
        approved_ids.append(str(item["id"]))

    _persist_claims(claims, state)
    return EvidenceBulkApproveResult(
        approved_count=len(approved_ids),
        approved_claim_ids=approved_ids,
        skipped_without_citation=skipped,
    )


def read_evidence_manifest(state: BrainSpaState | None = None) -> EvidenceManifest:
    notes = _load_notes()
    claims = _read_claims()
    if state is None:
        state = BrainSpaState()
    manifest = _rebuild_manifest(claims, notes, state)
    _save_manifest(manifest)
    return EvidenceManifest(**manifest)


def list_approved_claims(
    state: BrainSpaState,
    source_key: str | None = None,
    model: str | None = None,
) -> EvidenceApprovedClaimsResponse:
    claims = _read_claims()
    approved = [item for item in claims if item.get("status") == "approved"]
    if source_key:
        _source_for_key(state, source_key)
        approved = [item for item in approved if item.get("source_key") == source_key]
    elif model:
        keys = set(_source_keys_for_model(state, model))
        approved = [item for item in approved if item.get("source_key") in keys]

    manifest = read_evidence_manifest(state)
    slug = _model_slug(model) if model else BELIEVER_MODEL_SLUG
    model_bucket = manifest.models.get(slug, {}) if model else {}
    ready = bool(model_bucket.get("ready_for_datasets")) if model else manifest.approved_count > 0
    count = int(model_bucket.get("approved_count", len(approved))) if model else len(approved)

    labels = _source_label_map(state)
    return EvidenceApprovedClaimsResponse(
        approved_count=count if model else len(approved),
        claims=[_claim_model(item, labels) for item in approved],
        manifest_path=str(evidence_manifest_path()),
        ready_for_datasets=ready,
    )


def read_evidence_notes() -> EvidenceNotes:
    notes = _load_notes()
    return EvidenceNotes(
        behavior_focus=notes.get("behavior_focus") or DEFAULT_BEHAVIOR_FOCUS,
        sources=notes.get("sources") or {},
        notes_path=str(evidence_notes_path()),
    )
