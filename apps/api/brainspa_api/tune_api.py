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

_DATASET_SLUGS: dict[str, str] = {"snake_rollout": "snake"}


def _dataset_slug(dataset_key: str) -> str:
    return _DATASET_SLUGS.get(dataset_key, dataset_key)


def _dataset_display_label(dataset_key: str, label: str = "") -> str:
    if dataset_key == "snake_rollout":
        return "Snake rollout"
    return label or dataset_key

AdapterState = Literal["missing", "ready", "blocked", "stale"]


_DISPLAY_NAMES: dict[str, str] = {
    "snake_policy": "Snake Policy",
}

_SLUGS: dict[str, str] = {
    "snake_policy": "snake",
}


def _display_name(model_key: str, label: str) -> str:
    if label:
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


def _default_dataset_key(model_key: str, projects: list[dict[str, Any]], datasets: dict[str, Any]) -> str:
    for project in projects:
        if project.get("active_model") == model_key and project.get("active_dataset"):
            key = str(project["active_dataset"])
            if key in datasets:
                return key
    if "snake_rollout" in datasets:
        return "snake_rollout"
    return next(iter(datasets), "snake_rollout")


def _policy_status(model_key: str, model: dict[str, Any], datasets: dict[str, Any]) -> TuneModelStatus:
    from .policy_paths import snake_checkpoint_path, snake_train_job_path
    from .policy_paths import snake_acceptance_path

    project_key = "snake_rl_validation"
    dataset_key = "snake_rollout"
    dataset = datasets.get(dataset_key, {})
    job = _read_json(snake_train_job_path())
    checkpoint = snake_checkpoint_path()
    policy_state: Literal["missing", "training", "ready", "stale", "blocked"] = "missing"
    if job and job.get("state") == "running":
        policy_state = "training"
    elif checkpoint.exists():
        policy_state = "ready"
    acceptance_payload = _read_json(snake_acceptance_path())
    acceptance = None
    if acceptance_payload:
        acceptance = TuneAcceptanceSummary(
            state="complete",
            passed=acceptance_payload.get("passed"),
            cases_passed=int(acceptance_payload.get("consecutive_full_board_max") or 0),
            cases_total=10,
            artifact_path=str(acceptance_payload.get("artifact_path") or snake_acceptance_path()),
        )
    return TuneModelStatus(
        model_key=model_key,
        slug=_slug(model_key),
        label=str(model.get("label") or model_key),
        display_name=_display_name(model_key, str(model.get("label") or "")),
        project_key=project_key,
        model_kind="policy",
        adapter_path=str(checkpoint),
        adapter_state="missing",
        policy_path=str(checkpoint),
        policy_state=policy_state,
        dataset_key=dataset_key,
        dataset_row_count=int(dataset.get("row_count") or 0),
        acceptance=acceptance,
    )


def tune_status_for_model(model_key: str) -> TuneModelStatus:
    state = BrainSpaState()
    payload = state.load()
    models = {item["key"]: item for item in payload.get("models", [])}
    datasets = {item["key"]: item for item in payload.get("datasets", [])}
    if model_key not in models:
        raise KeyError(model_key)

    model = models[model_key]
    if model.get("model_kind") == "policy":
        return _policy_status(model_key, model, datasets)
    raise KeyError(model_key)


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

    labels = {item.key: item.label for item in SCENARIOS_BY_MODEL.get(model_key, [])}
    counts: dict[str, int] = {}
    for row in rows:
        metadata = row.get("metadata") or {}
        scenario_key = str(metadata.get("scenario_key") or "autonomous-train")
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
    resolved_dataset = dataset_key or status.dataset_key or "snake_rollout"
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
