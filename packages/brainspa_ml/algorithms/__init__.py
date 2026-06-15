"""Algorithm registry for the Brain Spa ML core."""

from __future__ import annotations

from .base import (
    AlgorithmSpec,
    Policy,
    evaluate_policy,
    get_algorithm,
    list_algorithm_specs,
    load_policy,
    register_algorithm,
    rollout_episode,
    train_algorithm,
)


def _ensure_builtin_algorithms() -> None:
    from . import dqn, ppo, q_learning, reinforce  # noqa: F401


_ensure_builtin_algorithms()

__all__ = [
    "AlgorithmSpec",
    "Policy",
    "evaluate_policy",
    "get_algorithm",
    "list_algorithm_specs",
    "load_policy",
    "register_algorithm",
    "rollout_episode",
    "train_algorithm",
]
