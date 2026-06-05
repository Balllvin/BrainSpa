"""10x10 Snake environment for Brain Spa policy training."""

from .rewards import RewardBreakdown, RewardDecomposer
from .sim import ACTION_NAMES, SnakeSim, SnakeState
from .state import ACTION_COUNT, encode_state, state_dim_for_profile

__all__ = [
    "ACTION_COUNT",
    "ACTION_NAMES",
    "RewardBreakdown",
    "RewardDecomposer",
    "SnakeSim",
    "SnakeState",
    "encode_state",
    "state_dim_for_profile",
]