from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import Any

from .policy_datasets import SNAKE_DATASET_KEY, append_episode
from .policy_paths import (
    SNAKE_MODEL_KEY,
    SNAKE_PROJECT_KEY,
    snake_checkpoint_path,
    snake_train_job_path,
    snake_train_result_path,
)
from packages.brainspa_environments.snake.sim import new_episode_id

_TRAIN_THREADS: dict[str, threading.Thread] = {}
_TRAIN_LOCK = threading.Lock()
_STOP_FLAGS: dict[str, bool] = {}


def _write_job(payload: dict[str, Any]) -> None:
    path = snake_train_job_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def read_policy_train_job() -> dict[str, Any] | None:
    path = snake_train_job_path()
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None


def request_stop_training() -> None:
    _STOP_FLAGS[SNAKE_PROJECT_KEY] = True


def start_policy_train(
    *,
    episodes: int = 100,
    env_profiles: list[str] | None = None,
    policy_backend: str = "dqn",
) -> dict[str, Any]:
    from .snake_train_lab import read_snake_lab

    project_key = SNAKE_PROJECT_KEY
    with _TRAIN_LOCK:
        existing = read_policy_train_job()
        if existing and existing.get("state") == "running":
            return existing
        if read_snake_lab().get("running"):
            return {
                "state": "failed",
                "phase": "blocked",
                "error": "Simulation lab is running. Stop the lab before headless training.",
                "model_key": SNAKE_MODEL_KEY,
                "dataset_key": SNAKE_DATASET_KEY,
                "episodes_target": episodes,
                "episode": 0,
                "epsilon": 0.0,
                "mean_reward": 0.0,
            }

        _STOP_FLAGS[project_key] = False
        _write_job(
            {
                "state": "running",
                "phase": "starting",
                "model_key": SNAKE_MODEL_KEY,
                "dataset_key": SNAKE_DATASET_KEY,
                "episodes_target": episodes,
                "episode": 0,
                "epsilon": 1.0,
                "mean_reward": 0.0,
                "error": None,
            }
        )

        def run() -> None:
            checkpoint = snake_checkpoint_path()
            start_episode = 0
            if existing and isinstance(existing.get("episode"), int):
                start_episode = max(0, existing["episode"])

            def should_stop() -> bool:
                return _STOP_FLAGS.get(project_key, False)

            def on_episode(progress: Any, result: dict[str, Any]) -> None:
                if "reward_totals" in result:
                    episode_id = new_episode_id()
                    append_episode(
                        {
                            "episode_id": episode_id,
                            "scenario_key": "autonomous-train",
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
                        "phase": "training",
                        "model_key": SNAKE_MODEL_KEY,
                        "dataset_key": SNAKE_DATASET_KEY,
                        "episodes_target": episodes,
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

            try:
                profiles = env_profiles or ["coords"]
                if policy_backend == "sb3":
                    from packages.brainspa_training.policy_sb3 import train_snake_sb3

                    summary = train_snake_sb3(
                        checkpoint_path=checkpoint.parent / "policy_sb3",
                        episodes=episodes,
                        env_profile=profiles[0],
                        on_episode=on_episode,
                        should_stop=should_stop,
                    )
                else:
                    from packages.brainspa_training.policy_trainer import train_snake_policy

                    summary = train_snake_policy(
                        checkpoint_path=checkpoint,
                        episodes=episodes,
                        env_profiles=profiles,
                        on_episode=on_episode,
                        should_stop=should_stop,
                        start_episode=start_episode,
                    )
                snake_train_result_path().write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
                _write_job(
                    {
                        "state": "complete",
                        "phase": "done",
                        "model_key": SNAKE_MODEL_KEY,
                        "dataset_key": SNAKE_DATASET_KEY,
                        "episodes_target": episodes,
                        "episode": summary.get("episodes_completed", episodes),
                        "epsilon": summary.get("final_epsilon", 0.01),
                        "mean_reward": 0.0,
                        "error": None,
                        "result": summary,
                    }
                )
            except Exception as error:  # noqa: BLE001
                _write_job(
                    {
                        "state": "failed",
                        "phase": "error",
                        "model_key": SNAKE_MODEL_KEY,
                        "dataset_key": SNAKE_DATASET_KEY,
                        "episodes_target": episodes,
                        "episode": 0,
                        "error": str(error),
                    }
                )

        thread = threading.Thread(target=run, daemon=True)
        _TRAIN_THREADS[project_key] = thread
        thread.start()

    return read_policy_train_job() or {"state": "running"}