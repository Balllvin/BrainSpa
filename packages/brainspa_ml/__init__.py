"""Brain Spa generic ML core.

This package generalizes the Snake-only reference harness into a small, honest
platform for training *any* small model from scratch:

- A Gym-style :class:`Environment` protocol with a registry, plus from-scratch
  environments (CartPole, GridWorld) and an adapter for the existing Snake sim.
- An algorithm registry covering tabular Q-learning (zero deps), REINFORCE,
  DQN, and PPO (Torch when available).
- A supervised path: tabular dataset ingest/profiling/splitting plus linear
  models (zero deps) and a Torch MLP for classification and regression.
- A run/experiment registry and a threaded job runner so training streams
  metrics and produces inspectable artifacts under ``~/.brain-spa``.

The implementations are intentionally compact and educational. They draw on
well-known open-source references credited in ``docs/ml-platform.md``:
CleanRL (single-file RL), Farama Gymnasium classic control (env dynamics),
OpenAI Spinning Up (policy-gradient math) and scikit-learn (toy datasets).
"""

from __future__ import annotations

__all__ = [
    "spaces",
    "environments",
    "datasets",
    "runs",
    "jobs",
    "supervised",
]
