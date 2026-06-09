from __future__ import annotations

from typing import Any

import numpy as np

from .rewards import RewardDecomposer
from .sim import ACTION_COUNT, SnakeSim
from .state import encode_state


class BrainSpaSnakeEnv:
    """Minimal Gymnasium-style env for Stable-Baselines3 (optional)."""

    metadata = {"render_modes": []}

    def __init__(self, *, grid_size: int = 10, env_profile: str = "solo") -> None:
        self.grid_size = grid_size
        self.env_profile = env_profile
        self.sim = SnakeSim(grid_size=grid_size)
        self.decomposer = RewardDecomposer()
        self._prev = None

    def reset(self, *, seed: int | None = None, options: dict | None = None) -> tuple[np.ndarray, dict]:
        state = self.sim.reset(seed=seed)
        self.decomposer.reset(state)
        self._prev = state
        return np.array(encode_state(self.sim, state, env_profile=self.env_profile), dtype=np.float32), {}

    def step(self, action: int) -> tuple[np.ndarray, float, bool, bool, dict[str, Any]]:
        prev = self._prev or self.sim.state
        step = self.sim.step(int(action))
        breakdown = self.decomposer.step(prev, step.state, ate_apple=step.ate_apple)
        self._prev = step.state
        obs = np.array(encode_state(self.sim, step.state, env_profile=self.env_profile), dtype=np.float32)
        return obs, breakdown.total, step.state.done, False, {"outcome": step.state.outcome}

    @property
    def action_space_n(self) -> int:
        return ACTION_COUNT

    @property
    def observation_space_shape(self) -> tuple[int, ...]:
        return (len(encode_state(self.sim, self.sim.reset(seed=0), env_profile=self.env_profile)),)