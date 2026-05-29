from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal

from .config import runtime_root
from .models import (
    TuneAcceptanceSummary,
    TuneBuildPreview,
    TuneModelStatus,
    TuneScenarioCount,
    TuneStatusResponse,
)
from .state import BrainSpaState
from .test_scenarios import SCENARIOS_BY_MODEL
from .workflows import (
    _dataset_train_path,
    adapter_dir_for_model,
    project_key_for_model,
)

_DATASET_SLUGS: dict[str, str] = {
    "believer_seed": "believer",
}


def _dataset_slug(dataset_key: str) -> str:
    return _DATASET_SLUGS.get(dataset_key, dataset_key)


def _dataset_display_label(dataset_key: str, label: str = "") -> str:
    if dataset_key == "believer_seed":
        return "Believer training set"
    return label or dataset_key

AdapterState = Literal["missing", "ready", "blocked", "stale"]


_DISPLAY_NAMES: dict[str, str] = {
    "persona_small": "Believer",
    "coding_small": "Coding Worker",
}

_SLUGS: dict[str, str] = {
    "persona_small": "believer",
    "coding_small": "coding-worker",
}


def _display_name(model_key: str, label: str) -> str:
    if label and label not in {"Persona Small", "Coding Small"}:
        return label
    return _DISPLAY_NAMES.get(model_key, label or model_key)


def _slug(model_key: str) -> str:
    return _SLUGS.get(model_key, model_key)


def _read_json(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None


def _iso_mtime(path: Path) -> str | None:
    if not path.exists():
        return None
    stamp = datetime.fromtimestamp(path.stat().st_mtime, tz=UTC)
    return stamp.isoformat()


def _adapter_ready(adapter_dir: Path) -> bool:
    if not adapter_dir.is_dir():
        return False
    markers = ("adapter_config.json", "adapter_model.safetensors", "pytorch_model.bin")
    return any((adapter_dir / name).exists() for name in markers) or any(adapter_dir.iterdir())


def _read_acceptance_summary() -> TuneAcceptanceSummary | None:
    path = runtime_root() / "artifacts" / "evals" / "believer_acceptance.json"
    payload = _read_json(path)
    if not payload:
        return None
    cases = payload.get("cases") or []
    passed_cases = sum(1 for case in cases if case.get("passed"))
    return TuneAcceptanceSummary(
        state=str(payload.get("state") or "unknown"),
        passed=payload.get("passed") if payload.get("state") == "complete" else None,
        cases_passed=passed_cases,
        cases_total=len(cases),
        artifact_path=str(payload.get("artifact_path") or path),
    )


def _default_dataset_key(model_key: str, projects: list[dict[str, Any]], datasets: dict[str, Any]) -> str:
    for project in projects:
        if project.get("active_model") == model_key and project.get("active_dataset"):
            key = str(project["active_dataset"])
            if key in datasets:
                return key
    if "believer_seed" in datasets:
        return "believer_seed"
    return next(iter(datasets), "believer_seed")


def tune_status_for_model(model_key: str) -> TuneModelStatus:
    state = BrainSpaState()
    payload = state.load()
    models = {item["key"]: item for item in payload.get("models", [])}
    datasets = {item["key"]: item for item in payload.get("datasets", [])}
    if model_key not in models:
        raise KeyError(model_key)

    model = models[model_key]
    project_key = project_key_for_model(model_key)
    adapter_dir = adapter_dir_for_model(model_key, project_key)
    adapter_path = str(adapter_dir)

    build_payload = _read_json(adapter_dir / "adapter_build_result.json")
    dry_run_payload = _read_json(runtime_root() / "artifacts" / "training" / project_key / "dry_run.json")

    dataset_key = _default_dataset_key(model_key, payload.get("projects", []), datasets)
    dataset = datasets.get(dataset_key, {})
    dataset_row_count = int(dataset.get("row_count") or 0)

    build_dataset_key = str(build_payload["dataset_key"]) if build_payload and build_payload.get("dataset_key") else None
    build_rows_used = int(build_payload["rows_used"]) if build_payload and build_payload.get("rows_used") is not None else None
    build_state = str(build_payload["state"]) if build_payload and build_payload.get("state") else None
    built_at = _iso_mtime(adapter_dir / "adapter_build_result.json")

    missing: list[str] = []
    if build_payload and build_payload.get("missing_requirements"):
        missing = list(build_payload["missing_requirements"])
    elif dry_run_payload and dry_run_payload.get("missing_requirements"):
        missing = list(dry_run_payload["missing_requirements"])

    adapter_state: AdapterState = "missing"
    if build_state == "blocked" or (build_payload and not _adapter_ready(adapter_dir)):
        adapter_state = "blocked"
    elif _adapter_ready(adapter_dir) and build_state == "complete":
        adapter_state = "ready"
    elif _adapter_ready(adapter_dir):
        adapter_state = "ready"
    elif build_state == "blocked":
        adapter_state = "blocked"

    stale = False
    stale_reason: str | None = None
    if adapter_state == "ready" and build_state == "complete":
        if build_rows_used is not None and dataset_row_count != build_rows_used:
            stale = True
            stale_reason = (
                f"Dataset now has {dataset_row_count} rows; last build used {build_rows_used}. Rebuild recommended."
            )
        train_path = _dataset_train_path(dataset)
        build_meta = adapter_dir / "adapter_build_result.json"
        if train_path and train_path.exists() and build_meta.exists():
            if train_path.stat().st_mtime > build_meta.stat().st_mtime + 1:
                stale = True
                stale_reason = "Training data changed since the last adapter build. Rebuild recommended."

    if stale and adapter_state == "ready":
        adapter_state = "stale"

    acceptance = _read_acceptance_summary() if model_key == "persona_small" else None

    return TuneModelStatus(
        model_key=model_key,
        slug=_slug(model_key),
        label=str(model.get("label") or model_key),
        display_name=_display_name(model_key, str(model.get("label") or "")),
        project_key=project_key,
        adapter_path=adapter_path,
        adapter_state=adapter_state,
        dataset_key=dataset_key,
        dataset_row_count=dataset_row_count,
        build_dataset_key=build_dataset_key,
        build_rows_used=build_rows_used,
        build_state=build_state,
        built_at=built_at,
        stale=stale,
        stale_reason=stale_reason,
        dry_run_state=str(dry_run_payload["state"]) if dry_run_payload and dry_run_payload.get("state") else None,
        missing_requirements=missing,
        acceptance=acceptance,
    )


def list_tune_status() -> TuneStatusResponse:
    state = BrainSpaState()
    models = state.load().get("models", [])
    statuses: list[TuneModelStatus] = []
    for item in models:
        key = str(item.get("key") or "")
        if not key or item.get("state") in {"retired", "archived"}:
            continue
        try:
            statuses.append(tune_status_for_model(key))
        except KeyError:
            continue
    return TuneStatusResponse(models=statuses)


def tune_status_for_slug(slug: str) -> TuneModelStatus:
    state = BrainSpaState()
    models = state.load().get("models", [])
    for item in models:
        key = str(item.get("key") or "")
        if _slug(key) == slug or key == slug:
            return tune_status_for_model(key)
    raise KeyError(slug)


def _scenario_breakdown(dataset_key: str, model_key: str) -> list[TuneScenarioCount]:
    from .datasets_workflows import _load_rows

    try:
        rows = _load_rows(dataset_key)
    except Exception:
        return []

    labels = {item.key: item.label for item in SCENARIOS_BY_MODEL.get(model_key, SCENARIOS_BY_MODEL.get("persona_small", []))}
    counts: dict[str, int] = {}
    for row in rows:
        metadata = row.get("metadata") or {}
        scenario_key = str(metadata.get("scenario_key") or "counsel")
        counts[scenario_key] = counts.get(scenario_key, 0) + 1

    return [
        TuneScenarioCount(
            key=key,
            label=labels.get(key, key.replace("-", " ").title()),
            count=count,
        )
        for key, count in sorted(counts.items(), key=lambda item: (-item[1], item[0]))
    ]


def tune_build_preview(model_slug: str, dataset_key: str | None = None) -> TuneBuildPreview:
    status = tune_status_for_slug(model_slug)
    resolved_dataset = dataset_key or status.dataset_key or "believer_seed"
    state = BrainSpaState()
    datasets = {item["key"]: item for item in state.load().get("datasets", [])}
    dataset = datasets.get(resolved_dataset, {})
    row_count = int(dataset.get("row_count") or 0)
    breakdown = _scenario_breakdown(resolved_dataset, status.model_key)

    return TuneBuildPreview(
        model_key=status.model_key,
        slug=status.slug,
        dataset_key=resolved_dataset,
        dataset_slug=_dataset_slug(resolved_dataset),
        dataset_display_label=_dataset_display_label(resolved_dataset, str(dataset.get("label") or "")),
        row_count=row_count if row_count else sum(item.count for item in breakdown),
        scenario_breakdown=breakdown,
        adapter_state=status.adapter_state,
        built_at=status.built_at,
        build_rows_used=status.build_rows_used,
        stale=status.stale,
        stale_reason=status.stale_reason,
    )
