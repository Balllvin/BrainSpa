"""MountainCar — an underpowered car must build momentum to escape a valley.

A sparse-reward classic control task (reward -1 per step until the goal),
implemented from scratch with Gymnasium's `MountainCar-v0` dynamics. It is a
useful contrast to CartPole: exploration matters far more here.

Reference: Farama Gymnasium classic_control/mountain_car.py (Moore 1990).
"""

from __future__ import annotations

import math
import random
from typing import Any

from ..environments import EnvSpec, StepResult, register_env
from ..spaces import Box, Discrete


class MountainCar:
    MIN_POSITION = -1.2
    MAX_POSITION = 0.6
    MAX_SPEED = 0.07
    GOAL_POSITION = 0.5
    FORCE = 0.001
    GRAVITY = 0.0025
    MAX_STEPS = 200

    def __init__(self, *, seed: int | None = None) -> None:
        self.observation_space = Box(dim=2, low=-1.2, high=0.6)
        self.action_space = Discrete(3)  # 0=left, 1=none, 2=right
        self._rng = random.Random(seed)
        self._position = -0.5
        self._velocity = 0.0
        self._steps = 0
        self.reset(seed=seed)

    def reset(self, *, seed: int | None = None) -> list[float]:
        if seed is not None:
            self._rng = random.Random(seed)
        self._position = self._rng.uniform(-0.6, -0.4)
        self._velocity = 0.0
        self._steps = 0
        return [self._position, self._velocity]

    def step(self, action: int) -> StepResult:
        self._velocity += (action - 1) * self.FORCE + math.cos(3 * self._position) * (-self.GRAVITY)
        self._velocity = max(-self.MAX_SPEED, min(self.MAX_SPEED, self._velocity))
        self._position += self._velocity
        self._position = max(self.MIN_POSITION, min(self.MAX_POSITION, self._position))
        if self._position == self.MIN_POSITION and self._velocity < 0:
            self._velocity = 0.0
        self._steps += 1

        terminated = self._position >= self.GOAL_POSITION
        truncated = self._steps >= self.MAX_STEPS
        reward = 0.0 if terminated else -1.0
        return [self._position, self._velocity], reward, terminated, truncated, {"steps": self._steps}

    def render_state(self) -> dict[str, Any]:
        return {
            "kind": "mountaincar",
            "position": self._position,
            "velocity": self._velocity,
            "goal": self.GOAL_POSITION,
            "steps": self._steps,
        }


register_env(
    EnvSpec(
        id="mountaincar",
        label="MountainCar",
        description="Drive an underpowered car out of a valley by building momentum. Sparse reward — exploration matters.",
        obs_dim=2,
        num_actions=3,
        max_episode_steps=MountainCar.MAX_STEPS,
        factory=MountainCar,
        tags=("control", "continuous-obs", "sparse-reward", "from-scratch"),
        reward_threshold=-110.0,
        source="Farama Gymnasium classic_control (Moore 1990)",
    )
)
