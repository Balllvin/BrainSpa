from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .config import runtime_root
from .state import BrainSpaState

SNAKE_DATASET_KEY = "snake_rollout"


def snake_dataset_dir(dataset_key: str = SNAKE_DATASET_KEY) -> Path:
    return runtime_root() / "artifacts" / "datasets" / dataset_key


def trajectories_path(dataset_key: str = SNAKE_DATASET_KEY) -> Path:
    return snake_dataset_dir(dataset_key) / "trajectories.jsonl"


def transitions_path(dataset_key: str = SNAKE_DATASET_KEY) -> Path:
    return snake_dataset_dir(dataset_key) / "transitions.jsonl"


def manifest_path(dataset_key: str = SNAKE_DATASET_KEY) -> Path:
    return snake_dataset_dir(dataset_key) / "manifest.json"


def append_episode(
    episode_summary: dict[str, Any],
    transitions: list[dict[str, Any]],
    *,
    dataset_key: str = SNAKE_DATASET_KEY,
) -> None:
    directory = snake_dataset_dir(dataset_key)
    directory.mkdir(parents=True, exist_ok=True)

    with trajectories_path(dataset_key).open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(episode_summary) + "\n")

    from .policy_performance import update_policy_performance_from_episode

    update_policy_performance_from_episode(episode_summary)

    if transitions:
        with transitions_path(dataset_key).open("a", encoding="utf-8") as handle:
            for row in transitions:
                handle.write(json.dumps(row) + "\n")

    _sync_manifest(dataset_key)


def _count_lines(path: Path) -> int:
    if not path.exists():
        return 0
    return sum(1 for line in path.read_text(encoding="utf-8").splitlines() if line.strip())


def _sync_manifest(dataset_key: str) -> None:
    traj_count = _count_lines(trajectories_path(dataset_key))
    trans_count = _count_lines(transitions_path(dataset_key))
    payload = {
        "export_kind": "brain_spa_policy_handoff",
        "schema_version": "1",
        "dataset_key": dataset_key,
        "trajectory_count": traj_count,
        "transition_count": trans_count,
        "project_key": "snake_rl_validation",
        "preferred_model": "snake_policy",
    }
    manifest_path(dataset_key).write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")

    state = BrainSpaState()
    existing = next((item for item in state.load()["datasets"] if item["key"] == dataset_key), None)
    record = dict(existing or {})
    record.update(
        {
            "key": dataset_key,
            "label": record.get("label") or "Snake rollout",
            "goal": record.get("goal") or "Autonomous RL trajectories from Snake environments.",
            "state": "active" if trans_count else "draft",
            "row_count": trans_count,
            "artifact_path": str(manifest_path(dataset_key)),
            "quality_notes": record.get("quality_notes") or [],
            "warnings": [] if trans_count else ["No transitions logged yet."],
        }
    )
    state.upsert_dataset(record)


def read_snake_dataset_summary(dataset_key: str = SNAKE_DATASET_KEY) -> dict[str, Any]:
    return {
        "dataset_key": dataset_key,
        "trajectory_count": _count_lines(trajectories_path(dataset_key)),
        "transition_count": _count_lines(transitions_path(dataset_key)),
        "manifest_path": str(manifest_path(dataset_key)),
        "trajectories_path": str(trajectories_path(dataset_key)),
        "transitions_path": str(transitions_path(dataset_key)),
    }


def list_transitions(dataset_key: str = SNAKE_DATASET_KEY, *, limit: int = 50, offset: int = 0) -> dict[str, Any]:
    path = transitions_path(dataset_key)
    rows: list[dict[str, Any]] = []
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    total = len(rows)
    page = rows[offset : offset + limit]
    return {"total": total, "offset": offset, "limit": limit, "rows": page}