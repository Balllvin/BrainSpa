"""Adapt the existing Snake sim to the generic Environment protocol.

This proves the abstraction is real: the same algorithms that train CartPole
and GridWorld also train the original reference environment, with no
Snake-specific code in the trainers.
"""

from __future__ import annotations

from typing import Any

from ..environments import EnvSpec, StepResult, register_env
from ..spaces import Box, Discrete


class SnakeEnv:
    def __init__(self, *, seed: int | None = None, env_profile: str = "solo") -> None:
        from packages.brainspa_environments.snake import encode_state, state_dim_for_profile
        from packages.brainspa_environments.snake.rewards import RewardDecomposer
        from packages.brainspa_environments.snake.sim import SnakeSim

        self._encode_state = encode_state
        self._RewardDecomposer = RewardDecomposer
        self._profile = env_profile
        self._sim = SnakeSim(seed=seed)
        self._decomposer: Any | None = None
        self._prev_state: Any | None = None
        self.observation_space = Box(dim=state_dim_for_profile(env_profile), low=0.0, high=1.0)
        self.action_space = Discrete(4)

    def reset(self, *, seed: int | None = None) -> list[float]:
        state = self._sim.reset(seed=seed)
        self._decomposer = self._RewardDecomposer(curriculum_stage="B", reward_mode="shaped")
        self._decomposer.reset(state)
        self._prev_state = state
        return self._encode_state(self._sim, state, env_profile=self._profile)

    def step(self, action: int) -> StepResult:
        prev = self._sim.state
        result = self._sim.step(int(action))
        breakdown = self._decomposer.step(prev, result.state, ate_apple=result.ate_apple)
        obs = self._encode_state(self._sim, result.state, env_profile=self._profile)
        done = result.state.done
        info = {
            "score": result.state.score,
            "length": result.state.length,
            "outcome": result.state.outcome,
            "ate_apple": result.ate_apple,
        }
        return obs, float(breakdown.total), done, False, info

    def render_state(self) -> dict[str, Any]:
        return self._sim.state and self._sim.to_public_dict()


register_env(
    EnvSpec(
        id="snake",
        label="Snake",
        description="The original reference policy environment, now trainable through the generic algorithm registry.",
        obs_dim=11,
        num_actions=4,
        max_episode_steps=500,
        factory=SnakeEnv,
        tags=("game", "reference", "shaped-reward"),
        reward_threshold=None,
        source="Brain Spa snake reference harness",
    )
)
