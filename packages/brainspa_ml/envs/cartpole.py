"""CartPole — the classic balance task, implemented from scratch.

Dynamics and constants match Farama Gymnasium's ``CartPole-v1`` (Euler
integrator), so a policy trained here behaves like the canonical benchmark.

Reference: Farama-Foundation/Gymnasium classic_control/cartpole.py
(originally Barto, Sutton & Anderson 1983).
"""

from __future__ import annotations

import math
import random
from typing import Any

from ..environments import EnvSpec, StepResult, register_env
from ..spaces import Box, Discrete


class CartPole:
    GRAVITY = 9.8
    MASS_CART = 1.0
    MASS_POLE = 0.1
    TOTAL_MASS = MASS_CART + MASS_POLE
    LENGTH = 0.5  # actually half the pole's length
    POLEMASS_LENGTH = MASS_POLE * LENGTH
    FORCE_MAG = 10.0
    TAU = 0.02  # seconds between state updates
    THETA_THRESHOLD = 12.0 * 2.0 * math.pi / 360.0  # 12 degrees in radians
    X_THRESHOLD = 2.4
    MAX_STEPS = 500

    def __init__(self, *, seed: int | None = None) -> None:
        self.observation_space = Box(dim=4, low=-3.0, high=3.0)
        self.action_space = Discrete(2)
        self._rng = random.Random(seed)
        self._state: tuple[float, float, float, float] = (0.0, 0.0, 0.0, 0.0)
        self._steps = 0
        self.reset(seed=seed)

    def reset(self, *, seed: int | None = None) -> list[float]:
        if seed is not None:
            self._rng = random.Random(seed)
        self._state = tuple(self._rng.uniform(-0.05, 0.05) for _ in range(4))  # type: ignore[assignment]
        self._steps = 0
        return list(self._state)

    def step(self, action: int) -> StepResult:
        x, x_dot, theta, theta_dot = self._state
        force = self.FORCE_MAG if action == 1 else -self.FORCE_MAG
        cos_t = math.cos(theta)
        sin_t = math.sin(theta)

        temp = (force + self.POLEMASS_LENGTH * theta_dot * theta_dot * sin_t) / self.TOTAL_MASS
        theta_acc = (self.GRAVITY * sin_t - cos_t * temp) / (
            self.LENGTH * (4.0 / 3.0 - self.MASS_POLE * cos_t * cos_t / self.TOTAL_MASS)
        )
        x_acc = temp - self.POLEMASS_LENGTH * theta_acc * cos_t / self.TOTAL_MASS

        # Euler integration.
        x += self.TAU * x_dot
        x_dot += self.TAU * x_acc
        theta += self.TAU * theta_dot
        theta_dot += self.TAU * theta_acc
        self._state = (x, x_dot, theta, theta_dot)
        self._steps += 1

        terminated = (
            x < -self.X_THRESHOLD
            or x > self.X_THRESHOLD
            or theta < -self.THETA_THRESHOLD
            or theta > self.THETA_THRESHOLD
        )
        truncated = self._steps >= self.MAX_STEPS
        reward = 1.0
        return list(self._state), reward, terminated, truncated, {"steps": self._steps}

    def render_state(self) -> dict[str, Any]:
        x, x_dot, theta, theta_dot = self._state
        return {
            "kind": "cartpole",
            "x": x,
            "x_dot": x_dot,
            "theta": theta,
            "theta_dot": theta_dot,
            "steps": self._steps,
            "x_threshold": self.X_THRESHOLD,
            "theta_threshold": self.THETA_THRESHOLD,
        }


register_env(
    EnvSpec(
        id="cartpole",
        label="CartPole",
        description="Balance a pole on a moving cart. Classic control benchmark; solved when the pole stays up for ~500 steps.",
        obs_dim=4,
        num_actions=2,
        max_episode_steps=CartPole.MAX_STEPS,
        factory=CartPole,
        tags=("control", "continuous-obs", "from-scratch"),
        reward_threshold=475.0,
        source="Farama Gymnasium classic_control (Barto et al. 1983)",
    )
)
