from __future__ import annotations

from pathlib import Path

from .config import runtime_root

SNAKE_MODEL_KEY = "snake_policy"
SNAKE_PROJECT_KEY = "snake_rl_validation"
SNAKE_DATASET_KEY = "snake_rollout"


def snake_project_dir() -> Path:
    return runtime_root() / "artifacts" / "training" / SNAKE_PROJECT_KEY


def snake_checkpoint_path() -> Path:
    return snake_project_dir() / "policy.pt"


def snake_train_job_path() -> Path:
    return snake_project_dir() / "rl_train_job.json"


def snake_train_result_path() -> Path:
    return snake_project_dir() / "policy_train_result.json"


def snake_acceptance_path() -> Path:
    return runtime_root() / "artifacts" / "evals" / "snake_acceptance.json"