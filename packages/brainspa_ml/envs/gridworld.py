"""GridWorld — a tabular-friendly navigation task, from scratch.

The agent starts at a corner and must reach a goal while avoiding walls. State
is fully discrete (``row * width + col``), so it doubles as the canonical
demo for tabular Q-learning, while also exposing a normalized vector
observation for neural algorithms.

Reference design: ankonzoid/LearningX and Sutton & Barto gridworld examples.
"""

from __future__ import annotations

from typing import Any

from ..environments import EnvSpec, StepResult, register_env
from ..spaces import Box, Discrete

# (row delta, col delta) for actions 0..3 = up, down, left, right.
_MOVES = ((-1, 0), (1, 0), (0, -1), (0, 1))

# A small, solvable default maze. '#' = wall, 'S' = start, 'G' = goal.
DEFAULT_MAP = (
    "S....",
    ".##..",
    "...#.",
    ".#...",
    "...#G",
)


class GridWorld:
    def __init__(self, *, seed: int | None = None, grid_map: tuple[str, ...] | None = None) -> None:
        self.map = grid_map or DEFAULT_MAP
        self.height = len(self.map)
        self.width = len(self.map[0])
        self.walls: set[tuple[int, int]] = set()
        self.start = (0, 0)
        self.goal = (self.height - 1, self.width - 1)
        for r, row in enumerate(self.map):
            for c, ch in enumerate(row):
                if ch == "#":
                    self.walls.add((r, c))
                elif ch == "S":
                    self.start = (r, c)
                elif ch == "G":
                    self.goal = (r, c)
        self.observation_space = Box(dim=4, low=0.0, high=1.0)
        self.action_space = Discrete(4)
        self.max_episode_steps = self.height * self.width * 4
        self._pos = self.start
        self._steps = 0

    def reset(self, *, seed: int | None = None) -> list[float]:
        self._pos = self.start
        self._steps = 0
        return self._obs()

    def discrete_index(self) -> int:
        r, c = self._pos
        return r * self.width + c

    @property
    def num_states(self) -> int:
        return self.height * self.width

    def _obs(self) -> list[float]:
        r, c = self._pos
        gr, gc = self.goal
        return [
            r / max(self.height - 1, 1),
            c / max(self.width - 1, 1),
            gr / max(self.height - 1, 1),
            gc / max(self.width - 1, 1),
        ]

    def step(self, action: int) -> StepResult:
        dr, dc = _MOVES[action % 4]
        r, c = self._pos
        nr, nc = r + dr, c + dc
        self._steps += 1
        if not (0 <= nr < self.height and 0 <= nc < self.width) or (nr, nc) in self.walls:
            # Bumping a wall/edge: stay put, small penalty.
            reward = -0.05
        else:
            self._pos = (nr, nc)
            reward = -0.01
        terminated = self._pos == self.goal
        if terminated:
            reward = 1.0
        truncated = self._steps >= self.max_episode_steps
        return self._obs(), reward, terminated, truncated, {"pos": self._pos, "steps": self._steps}

    def render_state(self) -> dict[str, Any]:
        return {
            "kind": "gridworld",
            "height": self.height,
            "width": self.width,
            "pos": list(self._pos),
            "goal": list(self.goal),
            "walls": [list(w) for w in sorted(self.walls)],
            "steps": self._steps,
        }


register_env(
    EnvSpec(
        id="gridworld",
        label="GridWorld",
        description="Navigate a small maze to the goal. Fully discrete state — the textbook home for tabular Q-learning.",
        obs_dim=4,
        num_actions=4,
        max_episode_steps=GridWorld().max_episode_steps,
        factory=GridWorld,
        tags=("navigation", "tabular", "from-scratch"),
        reward_threshold=0.8,
        source="Sutton & Barto gridworld; ankonzoid/LearningX",
        discrete_states=GridWorld().num_states,
    )
)
