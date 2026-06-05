from __future__ import annotations

from pydantic import BaseModel, Field


class TestScenarioPublic(BaseModel):
    key: str
    label: str
    mode: str = Field(description="chat | generate")
    placeholder: str = ""
    hint: str = ""


PERSONA_SCENARIOS = [
    TestScenarioPublic(
        key="counsel",
        label="COUNSEL",
        mode="chat",
        placeholder="What weighs on you?",
        hint="Talk through something on your mind.",
    ),
    TestScenarioPublic(
        key="advice",
        label="ADVICE",
        mode="chat",
        placeholder="What should I do when…",
        hint="Ask what to do in a situation.",
    ),
    TestScenarioPublic(
        key="daily-word",
        label="DAILY WORD",
        mode="generate",
        placeholder="",
        hint="One short encouragement for today.",
    ),
    TestScenarioPublic(
        key="witness",
        label="WITNESS",
        mode="chat",
        placeholder="Someone said faith is only coping…",
        hint="Answer a challenge to faith.",
    ),
]

CODING_SCENARIOS = [
    TestScenarioPublic(
        key="cli-task",
        label="CLI TASK",
        mode="chat",
        placeholder="What should the worker do?",
        hint="Describe a repo task to run.",
    ),
]

SNAKE_SCENARIOS = [
    TestScenarioPublic(
        key="autonomous-train",
        label="AUTONOMOUS TRAIN",
        mode="interactive_train",
        hint="Run the RL loop at max speed and log every reward component.",
    ),
    TestScenarioPublic(
        key="autonomous-watch",
        label="AUTONOMOUS WATCH",
        mode="interactive_watch",
        hint="Watch the trained policy play at human speed.",
    ),
    TestScenarioPublic(
        key="human-play",
        label="HUMAN PLAY",
        mode="interactive_play",
        hint="Play on the keyboard; sessions log to datasets.",
    ),
    TestScenarioPublic(
        key="coach-replay",
        label="COACH REPLAY",
        mode="interactive_coach",
        hint="See where your moves diverged from the policy.",
    ),
    TestScenarioPublic(
        key="human-vs-ai",
        label="HUMAN VS AI",
        mode="interactive_arena",
        hint="You versus the policy on one board.",
    ),
    TestScenarioPublic(
        key="dual-arena",
        label="DUAL ARENA",
        mode="interactive_arena",
        hint="Two snakes, one policy checkpoint.",
    ),
]

SCENARIOS_BY_MODEL: dict[str, list[TestScenarioPublic]] = {
    "persona_small": PERSONA_SCENARIOS,
    "coding_small": CODING_SCENARIOS,
    "snake_policy": SNAKE_SCENARIOS,
}


def list_test_scenarios(model_key: str) -> list[TestScenarioPublic]:
    return SCENARIOS_BY_MODEL.get(model_key, PERSONA_SCENARIOS)


def scenario_generation_text(scenario_key: str, user_text: str) -> str:
    text = user_text.strip()
    if scenario_key == "daily-word":
        return (
            "Give one short daily word of encouragement rooted in Scripture for today. "
            "One or two sentences. Speak directly to the reader."
        )
    if scenario_key == "advice":
        return f"Give practical Christian counsel for this situation: {text}"
    if scenario_key == "witness":
        return f"Answer this challenge to faith with calm conviction: {text}"
    if scenario_key == "cli-task":
        return f"Answer as a coding worker with repo awareness and a verification step: {text}"
    return text
