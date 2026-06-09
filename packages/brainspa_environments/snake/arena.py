from __future__ import annotations

import random
from dataclasses import dataclass
from typing import Literal

from .sim import (
    ACTION_DELTAS,
    ACTION_NAMES,
    GRID_SIZE,
    INITIAL_LENGTH,
    MAX_STEPS,
    OPPOSITE,
    ActionIndex,
    Direction,
)

ArenaOutcome = Literal[
    "in_progress",
    "player_win",
    "opponent_win",
    "draw",
    "player_died",
    "opponent_died",
    "max_steps",
]


@dataclass
class ArenaSnake:
    segments: list[tuple[int, int]]
    direction: Direction
    score: int
    alive: bool

    @property
    def head(self) -> tuple[int, int]:
        return self.segments[0]


@dataclass
class ArenaState:
    grid_size: int
    player: ArenaSnake
    opponent: ArenaSnake
    apple: tuple[int, int]
    steps: int
    done: bool
    outcome: ArenaOutcome
    winner: Literal["player", "opponent", "none"]


@dataclass
class ArenaStepResult:
    state: ArenaState
    player_action: Direction
    opponent_action: Direction
    player_ate: bool
    opponent_ate: bool


class SnakeArenaSim:
    """Two snakes, one apple. Player = index 0, opponent = index 1."""

    def __init__(self, *, grid_size: int = GRID_SIZE, seed: int | None = None) -> None:
        self.grid_size = grid_size
        self._rng = random.Random(seed)
        self._state: ArenaState | None = None

    @property
    def state(self) -> ArenaState:
        if self._state is None:
            raise RuntimeError("Call reset() first")
        return self._state

    def reset(self, seed: int | None = None) -> ArenaState:
        if seed is not None:
            self._rng.seed(seed)
        mid = self.grid_size // 2
        player = ArenaSnake(
            segments=[(mid, mid + offset) for offset in range(INITIAL_LENGTH)],
            direction="up",
            score=0,
            alive=True,
        )
        opponent = ArenaSnake(
            segments=[(mid + 2, mid + offset) for offset in range(INITIAL_LENGTH)],
            direction="down",
            score=0,
            alive=True,
        )
        occupied = set(player.segments) | set(opponent.segments)
        apple = self._spawn_apple(occupied)
        self._state = ArenaState(
            grid_size=self.grid_size,
            player=player,
            opponent=opponent,
            apple=apple,
            steps=0,
            done=False,
            outcome="in_progress",
            winner="none",
        )
        return self._state

    def step(self, player_action: Direction | ActionIndex, opponent_action: Direction | ActionIndex) -> ArenaStepResult:
        state = self.state
        if state.done:
            return ArenaStepResult(
                state=state,
                player_action=state.player.direction,
                opponent_action=state.opponent.direction,
                player_ate=False,
                opponent_ate=False,
            )

        p_act = self._resolve_action(player_action, state.player.direction)
        o_act = self._resolve_action(opponent_action, state.opponent.direction)

        player = state.player
        opponent = state.opponent
        apple = state.apple
        player_ate = False
        opponent_ate = False

        if player.alive:
            player, player_ate, apple = self._move_snake(player, p_act, apple, opponent.segments)
        if opponent.alive:
            opponent, opponent_ate, apple = self._move_snake(opponent, o_act, apple, player.segments)

        # Head-to-head
        if player.alive and opponent.alive and player.head == opponent.head:
            if player_ate and not opponent_ate:
                opponent.alive = False
            elif opponent_ate and not player_ate:
                player.alive = False
            else:
                player.alive = False
                opponent.alive = False

        steps = state.steps + 1
        done = False
        outcome: ArenaOutcome = "in_progress"
        winner: Literal["player", "opponent", "none"] = "none"

        if not player.alive and not opponent.alive:
            done = True
            outcome = "draw"
        elif not player.alive:
            done = True
            outcome = "opponent_win"
            winner = "opponent"
        elif not opponent.alive:
            done = True
            outcome = "player_win"
            winner = "player"
        elif steps >= MAX_STEPS:
            done = True
            outcome = "max_steps"
            if player.score > opponent.score:
                winner = "player"
                outcome = "player_win"
            elif opponent.score > player.score:
                winner = "opponent"
                outcome = "opponent_win"
            else:
                outcome = "draw"

        next_state = ArenaState(
            grid_size=self.grid_size,
            player=player,
            opponent=opponent,
            apple=apple,
            steps=steps,
            done=done,
            outcome=outcome,
            winner=winner,
        )
        self._state = next_state
        return ArenaStepResult(
            state=next_state,
            player_action=p_act,
            opponent_action=o_act,
            player_ate=player_ate,
            opponent_ate=opponent_ate,
        )

    def to_public_dict(self) -> dict:
        s = self.state

        def snake_dict(snake: ArenaSnake) -> dict:
            return {
                "snake": snake.segments,
                "direction": snake.direction,
                "score": snake.score,
                "alive": snake.alive,
                "length": len(snake.segments),
            }

        return {
            "mode": "arena",
            "grid_size": s.grid_size,
            "player": snake_dict(s.player),
            "opponent": snake_dict(s.opponent),
            "apple": s.apple,
            "steps": s.steps,
            "done": s.done,
            "outcome": s.outcome,
            "winner": s.winner,
        }

    def _resolve_action(self, action: Direction | ActionIndex, current: Direction) -> Direction:
        if isinstance(action, int):
            name = ACTION_NAMES[action % len(ACTION_NAMES)]
        else:
            name = action
        if name == OPPOSITE[current]:
            return current
        return name

    def _move_snake(
        self,
        snake: ArenaSnake,
        direction: Direction,
        apple: tuple[int, int],
        enemy_segments: list[tuple[int, int]],
    ) -> tuple[ArenaSnake, bool, tuple[int, int]]:
        if not snake.alive:
            return snake, False, apple

        dx, dy = ACTION_DELTAS[direction]
        head = snake.head
        new_head = (head[0] + dx, head[1] + dy)
        ate = False
        segments = list(snake.segments)

        if not self._in_bounds(new_head):
            return ArenaSnake(segments, direction, snake.score, False), False, apple
        if new_head in segments:
            return ArenaSnake(segments, direction, snake.score, False), False, apple
        if new_head in enemy_segments:
            return ArenaSnake(segments, direction, snake.score, False), False, apple

        segments = [new_head, *segments]
        score = snake.score
        if new_head == apple:
            ate = True
            score += 1
            occupied = set(segments)
            apple = self._spawn_apple(occupied)
        else:
            segments.pop()

        return ArenaSnake(segments, direction, score, True), ate, apple

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
            return (0, 0)
        return self._rng.choice(free)