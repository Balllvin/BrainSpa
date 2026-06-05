from __future__ import annotations

import json
from typing import Any

from packages.brainspa_environments.snake.sim import new_episode_id
from packages.brainspa_training.policy_trainer import TrainProgress
from packages.brainspa_training.snake_lab import LabPace, get_snake_train_lab

from .policy_datasets import append_episode
from .policy_paths import SNAKE_MODEL_KEY, snake_checkpoint_path, snake_train_job_path
from .policy_train import _STOP_FLAGS, SNAKE_PROJECT_KEY, _write_job, read_policy_train_job, request_stop_training


def _lab_progress_writer(progress: TrainProgress, result: dict[str, Any]) -> None:
    episode_id = new_episode_id()
    checkpoint = snake_checkpoint_path()
    append_episode(
        {
            "episode_id": episode_id,
            "scenario_key": "simulation-lab",
            "steps": result["steps"],
            "outcome": result["outcome"],
            "reward_totals_by_component": result["reward_totals"],
            "max_length": result["length"],
            "apples_eaten": result["score"],
            "coverage": result["coverage"],
        },
        [
            {**row, "episode_id": episode_id, "policy_version": str(checkpoint)}
            for row in result.get("transitions", [])
        ],
    )
    _write_job(
        {
            "state": "running",
            "phase": "lab",
            "model_key": SNAKE_MODEL_KEY,
            "dataset_key": "snake_rollout",
            "episodes_target": get_snake_train_lab().episodes_target,
            "episode": progress.episode,
            "epsilon": progress.epsilon,
            "mean_reward": progress.mean_reward,
            "mean_length": progress.mean_length,
            "mean_apples": progress.mean_apples,
            "curriculum_stage": progress.curriculum_stage,
            "last_outcome": progress.last_outcome,
            "error": None,
        }
    )


def start_snake_lab(
    *,
    slots: int = 6,
    episodes: int = 100,
    pace: LabPace = "train",
) -> dict[str, Any]:
    existing = read_policy_train_job()
    if existing and existing.get("state") == "running" and existing.get("phase") != "lab":
        return {"ok": False, "message": "Headless training is already running.", "lab": get_snake_train_lab().snapshot()}

    _STOP_FLAGS[SNAKE_PROJECT_KEY] = False
    lab = get_snake_train_lab()
    lab.configure_callbacks(
        on_progress=_lab_progress_writer,
        should_stop=lambda: _STOP_FLAGS.get(SNAKE_PROJECT_KEY, False),
    )
    _write_job(
        {
            "state": "running",
            "phase": "lab",
            "model_key": SNAKE_MODEL_KEY,
            "dataset_key": "snake_rollout",
            "episodes_target": episodes,
            "episode": 0,
            "epsilon": 1.0,
            "mean_reward": 0.0,
            "error": None,
        }
    )
    snapshot = lab.start(
        checkpoint_path=snake_checkpoint_path(),
        slots=slots,
        episodes_target=episodes,
        pace=pace,
    )
    return {"ok": True, "lab": snapshot}


def stop_snake_lab() -> dict[str, Any]:
    request_stop_training()
    lab = get_snake_train_lab()
    snapshot = lab.stop()
    job = read_policy_train_job() or {}
    finished = snapshot["episode"] >= snapshot["episodes_target"]
    _write_job(
        {
            **job,
            "state": "complete" if finished else "idle",
            "phase": "lab_stopped" if not finished else "lab_done",
            "episode": snapshot["episode"],
            "episodes_target": snapshot["episodes_target"],
        }
    )
    return {"ok": True, "lab": snapshot}


def tick_snake_lab() -> dict[str, Any]:
    return get_snake_train_lab().tick()


def read_snake_lab() -> dict[str, Any]:
    return get_snake_train_lab().snapshot()