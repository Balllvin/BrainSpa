from __future__ import annotations

from pathlib import Path
from typing import Any

from packages.brainspa_training.snake_lab import get_snake_train_lab

from .policy_datasets import SNAKE_DATASET_KEY, _sync_manifest, trajectories_path, transitions_path
from .policy_paths import (
    snake_acceptance_path,
    snake_checkpoint_path,
    snake_train_job_path,
    snake_train_result_path,
)
from .policy_performance import snake_performance_path
from .policy_train import _write_job, request_stop_training


def reset_snake_policy() -> dict[str, Any]:
    """Delete snake checkpoint, rollouts, performance history, and reset the live lab."""
    request_stop_training()
    lab = get_snake_train_lab()
    lab.stop()
    lab.clear_history()

    deleted: list[str] = []
    for path in (
        snake_checkpoint_path(),
        snake_train_job_path(),
        snake_train_result_path(),
        trajectories_path(),
        transitions_path(),
        snake_performance_path(),
        snake_acceptance_path(),
    ):
        if _unlink(path):
            deleted.append(path.name)

    trajectories_path().parent.mkdir(parents=True, exist_ok=True)
    _sync_manifest(SNAKE_DATASET_KEY)
    _write_job(
        {
            "state": "idle",
            "phase": "idle",
            "model_key": "snake_policy",
            "dataset_key": "snake_rollout",
            "episodes_target": lab.episodes_target,
            "episode": 0,
            "epsilon": 0.3,
            "mean_reward": 0.0,
            "mean_length": 0.0,
            "mean_apples": 0.0,
            "curriculum_stage": "A",
            "last_outcome": None,
            "error": None,
        }
    )

    return {"ok": True, "deleted": deleted, "lab": lab.snapshot()}


def _unlink(path: Path) -> bool:
    if not path.exists():
        return False
    path.unlink()
    return True
