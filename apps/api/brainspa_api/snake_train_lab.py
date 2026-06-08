from __future__ import annotations

import json
from typing import Any

from packages.brainspa_environments.snake.sim import new_episode_id
from packages.brainspa_training.policy_trainer import TrainProgress
from packages.brainspa_training.snake_lab import LabPace, get_snake_train_lab

from .policy_datasets import append_episode
from .policy_performance import load_lab_records, with_career_records
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
    career = load_lab_records()
    get_snake_train_lab().load_career_records(
        apples=career["record_apples"],
        moves=career["record_moves"],
        length=career["record_length"],
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
    speed_multiplier: float = 1.0,
) -> dict[str, Any]:
    existing = read_policy_train_job()
    if existing and existing.get("state") == "running" and existing.get("phase") != "lab":
        return {
            "ok": False,
            "message": "Headless training is already running.",
            "lab": with_career_records(get_snake_train_lab().snapshot()),
        }

    _STOP_FLAGS[SNAKE_PROJECT_KEY] = False
    lab = get_snake_train_lab()
    career = load_lab_records()
    lab.load_career_records(
        apples=career["record_apples"],
        moves=career["record_moves"],
        length=career["record_length"],
    )
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
        speed_multiplier=speed_multiplier,
    )
    return {"ok": True, "lab": with_career_records(snapshot)}


def set_snake_lab_speed(speed_multiplier: float) -> dict[str, Any]:
    lab = get_snake_train_lab()
    snapshot = lab.set_speed_multiplier(speed_multiplier)
    return {"ok": True, "lab": with_career_records(snapshot)}


def set_snake_lab_episodes(episodes: int) -> dict[str, Any]:
    lab = get_snake_train_lab()
    snapshot = lab.set_episodes_target(episodes)
    job = read_policy_train_job()
    if job and job.get("state") == "running" and job.get("phase") == "lab":
        job["episodes_target"] = snapshot["episodes_target"]
        _write_job(job)
    return {"ok": True, "lab": with_career_records(snapshot)}


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
    return {"ok": True, "lab": with_career_records(snapshot)}


def tick_snake_lab() -> dict[str, Any]:
    return with_career_records(get_snake_train_lab().tick())


def read_snake_lab() -> dict[str, Any]:
    return with_career_records(get_snake_train_lab().snapshot())


def reconcile_lab_train_job() -> dict[str, Any] | None:
    """Close stale lab jobs when the simulation finished without an explicit stop."""
    job = read_policy_train_job()
    if not job or job.get("state") != "running" or job.get("phase") != "lab":
        return job

    snapshot = get_snake_train_lab().snapshot()
    if snapshot.get("running"):
        return job

    finished = int(snapshot.get("episode") or 0) >= int(snapshot.get("episodes_target") or 0)
    _write_job(
        {
            **job,
            "state": "complete" if finished else "idle",
            "phase": "lab_done" if finished else "lab_stopped",
            "episode": snapshot.get("episode"),
            "episodes_target": snapshot.get("episodes_target"),
        }
    )
    return read_policy_train_job()