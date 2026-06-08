from __future__ import annotations

from .sim import ACTION_DELTAS, ACTION_NAMES, SnakeSim, SnakeState
from .wrappers import normalize_env_profile

ACTION_COUNT = len(ACTION_NAMES)
SOLO_STATE_DIM = 11
COORDS_BODY_SEGMENTS = 12
COORDS_STATE_DIM = 4 + 2 + 2 + 1 + COORDS_BODY_SEGMENTS * 2


def state_dim_for_profile(env_profile: str) -> int:
    env_profile = normalize_env_profile(env_profile)
    if env_profile == "coords":
        return COORDS_STATE_DIM
    if env_profile == "arena":
        from .arena_state import ARENA_STATE_DIM

        return ARENA_STATE_DIM
    if env_profile == "wrapped_v2":
        return SOLO_STATE_DIM + 2
    return SOLO_STATE_DIM


def hidden_dim_for_profile(env_profile: str) -> int:
    if normalize_env_profile(env_profile) == "coords":
        return 128
    return 256


def _norm_coord(value: int, grid_size: int) -> float:
    return value / max(grid_size - 1, 1)


def encode_coords(state: SnakeState) -> list[float]:
    """Minimal coords observation: heading, head, apple, length, body xy chain."""
    heading = [0.0] * 4
    heading[ACTION_NAMES.index(state.direction)] = 1.0
    head = state.head
    grid = state.grid_size
    vector: list[float] = [
        *heading,
        _norm_coord(head[0], grid),
        _norm_coord(head[1], grid),
        _norm_coord(state.apple[0], grid),
        _norm_coord(state.apple[1], grid),
        min(1.0, state.length / 100.0),
    ]
    for index in range(1, COORDS_BODY_SEGMENTS + 1):
        if index < len(state.snake):
            segment = state.snake[index]
            vector.extend([_norm_coord(segment[0], grid), _norm_coord(segment[1], grid)])
        else:
            vector.extend([0.0, 0.0])
    return vector


def _relative_offsets(direction: str) -> tuple[tuple[int, int], tuple[int, int], tuple[int, int]]:
    idx = ACTION_NAMES.index(direction)
    straight = ACTION_DELTAS[ACTION_NAMES[idx]]
    left = ACTION_DELTAS[ACTION_NAMES[(idx - 1) % 4]]
    right = ACTION_DELTAS[ACTION_NAMES[(idx + 1) % 4]]
    return left, right, straight


def _danger_flags(state: SnakeState) -> tuple[float, float, float]:
    head = state.head
    left_off, right_off, straight_off = _relative_offsets(state.direction)

    def blocked(offset: tuple[int, int]) -> float:
        x, y = head[0] + offset[0], head[1] + offset[1]
        if not (0 <= x < state.grid_size and 0 <= y < state.grid_size):
            return 1.0
        if (x, y) in state.snake:
            return 1.0
        return 0.0

    return blocked(straight_off), blocked(left_off), blocked(right_off)


def encode_state(_sim: SnakeSim, state: SnakeState, *, env_profile: str = "solo") -> list[float]:
    if normalize_env_profile(env_profile) == "coords":
        return encode_coords(state)

    straight, left, right = _danger_flags(state)
    head = state.head
    apple = state.apple

    vector: list[float] = [
        straight,
        left,
        right,
        1.0 if state.direction == "left" else 0.0,
        1.0 if state.direction == "right" else 0.0,
        1.0 if state.direction == "up" else 0.0,
        1.0 if state.direction == "down" else 0.0,
        1.0 if apple[0] < head[0] else 0.0,
        1.0 if apple[0] > head[0] else 0.0,
        1.0 if apple[1] < head[1] else 0.0,
        1.0 if apple[1] > head[1] else 0.0,
    ]

    if env_profile == "wrapped_v2":
        vector.extend([state.coverage, float(state.score) / 20.0])
    elif env_profile == "arena":
        vector.extend([state.coverage, 0.0, 0.0, 0.0])

    return vector