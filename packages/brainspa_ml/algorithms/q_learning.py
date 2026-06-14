"""Tabular Q-learning — pure Python, zero dependencies.

This is the honest "from scratch" baseline: no Torch, no NumPy, just a Q-table
and the Bellman update. It works on any environment that exposes a discrete
state index (e.g. GridWorld).

Reference: Watkins & Dayan (1992); Sutton & Barto, RL: An Introduction.
"""

from __future__ import annotations

import json
import random
from pathlib import Path
from typing import Any, Callable

from ..environments import Environment, EnvSpec
from .base import AlgorithmSpec, Policy, evaluate_policy, register_algorithm

DEFAULTS: dict[str, Any] = {
    "episodes": 400,
    "learning_rate": 0.1,
    "gamma": 0.99,
    "epsilon_start": 1.0,
    "epsilon_end": 0.05,
    "epsilon_decay": 0.995,
    "seed": 0,
}


class TablePolicy:
    def __init__(self, table: list[list[float]], num_actions: int) -> None:
        self._table = table
        self._num_actions = num_actions

    def act(self, observation: list[float], *, env: Environment | None = None) -> int:
        if env is None or not hasattr(env, "discrete_index"):
            return 0
        idx = env.discrete_index()  # type: ignore[attr-defined]
        if idx < 0 or idx >= len(self._table):
            return 0
        row = self._table[idx]
        best = max(range(self._num_actions), key=lambda a: row[a])
        return best


def _argmax(row: list[float]) -> int:
    return max(range(len(row)), key=lambda a: row[a])


def train(
    env_factory: Callable[[], Environment],
    *,
    hyperparams: dict[str, Any],
    on_metric: Callable[[dict[str, Any]], None],
    should_stop: Callable[[], bool],
    checkpoint_path: Path,
    env_spec: EnvSpec | None = None,
) -> dict[str, Any]:
    probe = env_factory()
    if not hasattr(probe, "discrete_index"):
        raise ValueError("Tabular Q-learning requires an environment with a discrete state index (e.g. gridworld).")
    num_states = int(getattr(probe, "num_states", env_spec.discrete_states if env_spec else 0) or 0)
    num_actions = probe.action_space.n
    if num_states <= 0:
        raise ValueError("Environment did not report num_states for the Q-table.")

    rng = random.Random(int(hyperparams["seed"]))
    table = [[0.0 for _ in range(num_actions)] for _ in range(num_states)]
    episodes = int(hyperparams["episodes"])
    lr = float(hyperparams["learning_rate"])
    gamma = float(hyperparams["gamma"])
    epsilon = float(hyperparams["epsilon_start"])
    epsilon_end = float(hyperparams["epsilon_end"])
    epsilon_decay = float(hyperparams["epsilon_decay"])

    reward_window: list[float] = []
    best_mean = float("-inf")
    episodes_done = 0

    for episode in range(episodes):
        if should_stop():
            break
        env = env_factory()
        env.reset(seed=int(hyperparams["seed"]) + episode)
        state_idx = env.discrete_index()  # type: ignore[attr-defined]
        total_reward = 0.0
        steps = 0
        done = False
        while not done:
            if rng.random() < epsilon:
                action = rng.randrange(num_actions)
            else:
                action = _argmax(table[state_idx])
            _, reward, terminated, truncated, _ = env.step(action)
            next_idx = env.discrete_index()  # type: ignore[attr-defined]
            done = terminated or truncated
            best_next = 0.0 if terminated else max(table[next_idx])
            td_target = reward + gamma * best_next
            table[state_idx][action] += lr * (td_target - table[state_idx][action])
            state_idx = next_idx
            total_reward += reward
            steps += 1

        epsilon = max(epsilon_end, epsilon * epsilon_decay)
        reward_window.append(total_reward)
        if len(reward_window) > 50:
            reward_window.pop(0)
        mean_reward = sum(reward_window) / len(reward_window)
        best_mean = max(best_mean, mean_reward)
        episodes_done += 1

        on_metric(
            {
                "episode": episodes_done,
                "epsilon": round(epsilon, 4),
                "episode_return": round(total_reward, 4),
                "mean_return": round(mean_reward, 4),
                "episode_length": steps,
            }
        )

    _save(checkpoint_path, table, num_actions)
    policy = TablePolicy(table, num_actions)
    evaluation = evaluate_policy(env_factory, policy, episodes=20)
    return {
        "algorithm": "q_learning",
        "episodes_completed": episodes_done,
        "best_mean_return": round(best_mean, 4) if episodes_done else None,
        "checkpoint_path": str(checkpoint_path),
        "evaluation": evaluation,
    }


def _save(path: Path, table: list[list[float]], num_actions: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"table": table, "num_actions": num_actions}), encoding="utf-8")


def load(checkpoint_path: Path, *, env_spec: EnvSpec | None = None) -> Policy:
    payload = json.loads(checkpoint_path.read_text(encoding="utf-8"))
    return TablePolicy(payload["table"], int(payload["num_actions"]))


register_algorithm(
    AlgorithmSpec(
        id="q_learning",
        label="Tabular Q-learning",
        description="Classic value-iteration over a Q-table. Pure Python, no Torch. Best for small discrete environments like GridWorld.",
        family="tabular",
        needs_torch=False,
        default_hyperparams=DEFAULTS,
        source="Watkins & Dayan 1992; Sutton & Barto",
        tags=("model-free", "value", "discrete-state", "no-deps"),
        train_fn=train,
        load_fn=load,
    )
)
