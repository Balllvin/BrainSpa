from __future__ import annotations

from .sim import SnakeSim

ENV_PROFILES = ("solo", "wrapped_v2", "arena")


def env_profile_for_scenario(scenario_key: str) -> str:
    if scenario_key in {"dual-arena", "human-vs-ai"}:
        return "arena"
    if scenario_key == "autonomous-train":
        return "solo"
    return "solo"


def make_sim(*, scenario_key: str, seed: int | None = None) -> SnakeSim:
    return SnakeSim(seed=seed)