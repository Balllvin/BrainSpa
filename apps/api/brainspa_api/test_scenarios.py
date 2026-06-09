from __future__ import annotations

from pydantic import BaseModel, Field


class TestScenarioPublic(BaseModel):
    key: str
    label: str
    mode: str = Field(description="chat | generate | interactive_*")
    placeholder: str = ""
    hint: str = ""


SNAKE_SCENARIOS = [
    TestScenarioPublic(
        key="autonomous-train",
        label="AUTONOMOUS TRAIN",
        mode="interactive_train",
        hint="Six boards train in parallel.",
    ),
    TestScenarioPublic(
        key="autonomous-watch",
        label="AUTONOMOUS WATCH",
        mode="interactive_watch",
        hint="Policy plays solo — pick speed.",
    ),
    TestScenarioPublic(
        key="human-play",
        label="HUMAN PLAY",
        mode="interactive_play",
        hint="You control the snake.",
    ),
    TestScenarioPublic(
        key="coach-replay",
        label="COACH REPLAY",
        mode="interactive_coach",
        hint="Step through a saved game.",
    ),
    TestScenarioPublic(
        key="human-vs-ai",
        label="HUMAN VS AI",
        mode="interactive_arena",
        hint="You vs policy on one board.",
    ),
    TestScenarioPublic(
        key="dual-arena",
        label="DUAL ARENA",
        mode="interactive_arena",
        hint="Two policies head to head.",
    ),
]

SCENARIOS_BY_MODEL: dict[str, list[TestScenarioPublic]] = {"snake_policy": SNAKE_SCENARIOS}

MODEL_SLUG_TO_KEY: dict[str, str] = {"snake": "snake_policy"}


def resolve_test_model_key(slug_or_key: str) -> str | None:
    if slug_or_key in MODEL_SLUG_TO_KEY:
        return MODEL_SLUG_TO_KEY[slug_or_key]
    if slug_or_key in SCENARIOS_BY_MODEL:
        return slug_or_key
    return None


def list_test_scenarios(slug_or_key: str) -> list[TestScenarioPublic]:
    model_key = resolve_test_model_key(slug_or_key)
    if model_key is None:
        return []
    return SCENARIOS_BY_MODEL[model_key]


def scenario_generation_text(scenario_key: str, user_text: str) -> str:
    text = user_text.strip()
    return text
