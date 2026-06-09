"""10x10 Snake environment for Brain Spa policy training."""

from .arena import SnakeArenaSim
from .arena_state import ARENA_STATE_DIM, encode_arena_opponent, encode_arena_player
from .rewards import RewardBreakdown, RewardDecomposer
from .sim import ACTION_NAMES, SnakeSim, SnakeState
from .state import (
    ACTION_COUNT,
    COORDS_BODY_SEGMENTS,
    COORDS_STATE_DIM,
    encode_state,
    hidden_dim_for_profile,
    state_dim_for_profile,
)

__all__ = [
    "ACTION_COUNT",
    "ACTION_NAMES",
    "ARENA_STATE_DIM",
    "RewardBreakdown",
    "RewardDecomposer",
    "SnakeArenaSim",
    "SnakeSim",
    "SnakeState",
    "encode_arena_opponent",
    "encode_arena_player",
    "COORDS_BODY_SEGMENTS",
    "COORDS_STATE_DIM",
    "encode_state",
    "hidden_dim_for_profile",
    "state_dim_for_profile",
]