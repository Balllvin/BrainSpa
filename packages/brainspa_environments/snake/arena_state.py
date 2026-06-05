from __future__ import annotations

from .arena import ArenaSnake, SnakeArenaSim
from .sim import ACTION_DELTAS, SnakeSim, SnakeState
from .state import _danger_flags

ARENA_STATE_DIM = 15


def encode_arena_player(sim: SnakeArenaSim) -> list[float]:
    return _encode_pov(sim, role="player")


def encode_arena_opponent(sim: SnakeArenaSim) -> list[float]:
    return _encode_pov(sim, role="opponent")


def _encode_pov(sim: SnakeArenaSim, *, role: str) -> list[float]:
    state = sim.state
    if role == "player":
        snake, enemy = state.player, state.opponent
    else:
        snake, enemy = state.opponent, state.player

    pseudo = SnakeState(
        grid_size=state.grid_size,
        snake=snake.segments,
        direction=snake.direction,
        apple=state.apple,
        score=snake.score,
        steps=state.steps,
        done=state.done,
        outcome="in_progress",
    )
    straight, left, right = _danger_flags(pseudo)
    head = pseudo.head
    apple = state.apple
    enemy_head = enemy.head if enemy.alive else head

    vector: list[float] = [
        straight,
        left,
        right,
        1.0 if pseudo.direction == "left" else 0.0,
        1.0 if pseudo.direction == "right" else 0.0,
        1.0 if pseudo.direction == "up" else 0.0,
        1.0 if pseudo.direction == "down" else 0.0,
        1.0 if apple[0] < head[0] else 0.0,
        1.0 if apple[0] > head[0] else 0.0,
        1.0 if apple[1] < head[1] else 0.0,
        1.0 if apple[1] > head[1] else 0.0,
        pseudo.coverage,
        (enemy_head[0] - head[0]) / max(state.grid_size, 1),
        (enemy_head[1] - head[1]) / max(state.grid_size, 1),
        (abs(enemy_head[0] - head[0]) + abs(enemy_head[1] - head[1])) / max(state.grid_size * 2, 1),
    ]
    return vector