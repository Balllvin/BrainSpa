from __future__ import annotations

from .arena import SnakeArenaSim
from .sim import SnakeSim

ENV_PROFILES = ("solo", "wrapped_v2", "arena", "coords")


def normalize_env_profile(env_profile: str) -> str:
    """Map legacy profile names to the current canonical name."""
    if env_profile == "coords_v1":
        return "coords"
    return env_profile


def env_profile_for_scenario(scenario_key: str) -> str:
    if scenario_key in {"dual-arena", "human-vs-ai"}:
        return "arena"
    return "coords"


def is_arena_scenario(scenario_key: str) -> bool:
    return scenario_key in {"dual-arena", "human-vs-ai"}


def make_sim(*, scenario_key: str, seed: int | None = None) -> SnakeSim:
    return SnakeSim(seed=seed)


def make_arena_sim(*, seed: int | None = None) -> SnakeArenaSim:
    return SnakeArenaSim(seed=seed)