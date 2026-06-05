from __future__ import annotations

import random
import uuid
from dataclasses import dataclass, field
from typing import Literal

Direction = Literal["up", "down", "left", "right"]
ActionIndex = int

ACTION_NAMES: tuple[Direction, ...] = ("up", "down", "left", "right")
ACTION_DELTAS: dict[Direction, tuple[int, int]] = {
    "up": (0, -1),
    "down": (0, 1),
    "left": (-1, 0),
    "right": (1, 0),
}
OPPOSITE: dict[Direction, Direction] = {
    "up": "down",
    "down": "up",
    "left": "right",
    "right": "left",
}

GRID_SIZE = 10
CELL_COUNT = GRID_SIZE * GRID_SIZE
INITIAL_LENGTH = 3
MAX_STEPS = 500

EpisodeOutcome = Literal["full_board", "died_wall", "died_self", "max_steps", "in_progress"]


@dataclass
class SnakeState:
    grid_size: int
    snake: list[tuple[int, int]]
    direction: Direction
    apple: tuple[int, int]
    score: int
    steps: int
    done: bool
    outcome: EpisodeOutcome

    @property
    def length(self) -> int:
        return len(self.snake)

    @property
    def head(self) -> tuple[int, int]:
        return self.snake[0]

    @property
    def coverage(self) -> float:
        return self.length / (self.grid_size * self.grid_size)


@dataclass
class StepResult:
    state: SnakeState
    action: Direction
    ate_apple: bool


class SnakeSim:
    def __init__(self, *, grid_size: int = GRID_SIZE, seed: int | None = None) -> None:
        self.grid_size = grid_size
        self._rng = random.Random(seed)
        self._state: SnakeState | None = None

    @property
    def state(self) -> SnakeState:
        if self._state is None:
            raise RuntimeError("Call reset() before reading state")
        return self._state

    def reset(self, seed: int | None = None) -> SnakeState:
        if seed is not None:
            self._rng.seed(seed)
        center = self.grid_size // 2
        snake = [(center, center + offset) for offset in range(INITIAL_LENGTH)]
        direction: Direction = "up"
        apple = self._spawn_apple(set(snake))
        self._state = SnakeState(
            grid_size=self.grid_size,
            snake=snake,
            direction=direction,
            apple=apple,
            score=0,
            steps=0,
            done=False,
            outcome="in_progress",
        )
        return self._state

    def step(self, action: Direction | ActionIndex) -> StepResult:
        state = self.state
        if state.done:
            return StepResult(state=state, action=state.direction, ate_apple=False)

        if isinstance(action, int):
            action_name = ACTION_NAMES[action % len(ACTION_NAMES)]
        else:
            action_name = action

        # Disallow instant reverse
        if action_name != OPPOSITE[state.direction]:
            direction = action_name
        else:
            direction = state.direction

        dx, dy = ACTION_DELTAS[direction]
        head_x, head_y = state.snake[0]
        new_head = (head_x + dx, head_y + dy)
        ate_apple = False
        outcome: EpisodeOutcome = "in_progress"
        done = False

        score = state.score
        apple = state.apple

        if not self._in_bounds(new_head):
            outcome = "died_wall"
            done = True
            new_snake = list(state.snake)
        elif new_head in state.snake:
            outcome = "died_self"
            done = True
            new_snake = list(state.snake)
        else:
            new_snake = [new_head, *state.snake]
            if new_head == state.apple:
                ate_apple = True
                score = state.score + 1
                if len(new_snake) >= self.grid_size * self.grid_size:
                    outcome = "full_board"
                    done = True
                    apple = new_head
                else:
                    apple = self._spawn_apple(set(new_snake))
            else:
                new_snake.pop()

            if not done and state.steps + 1 >= MAX_STEPS:
                outcome = "max_steps"
                done = True

        next_state = SnakeState(
            grid_size=self.grid_size,
            snake=new_snake,
            direction=direction,
            apple=apple,
            score=score,
            steps=state.steps + 1,
            done=done,
            outcome=outcome,
        )

        self._state = next_state
        return StepResult(state=next_state, action=direction, ate_apple=ate_apple)

    def legal_actions(self) -> list[Direction]:
        state = self.state
        return [name for name in ACTION_NAMES if name != OPPOSITE[state.direction]]

    def to_public_dict(self) -> dict:
        state = self.state
        return {
            "grid_size": state.grid_size,
            "snake": state.snake,
            "direction": state.direction,
            "apple": state.apple,
            "score": state.score,
            "steps": state.steps,
            "length": state.length,
            "coverage": round(state.coverage, 4),
            "done": state.done,
            "outcome": state.outcome,
        }

    def _in_bounds(self, pos: tuple[int, int]) -> bool:
        x, y = pos
        return 0 <= x < self.grid_size and 0 <= y < self.grid_size

    def _spawn_apple(self, occupied: set[tuple[int, int]]) -> tuple[int, int]:
        free = [
            (x, y)
            for x in range(self.grid_size)
            for y in range(self.grid_size)
            if (x, y) not in occupied
        ]
        if not free:
            return self.state.head if self._state else (0, 0)
        return self._rng.choice(free)


def new_episode_id() -> str:
    return f"ep-{uuid.uuid4().hex[:12]}"