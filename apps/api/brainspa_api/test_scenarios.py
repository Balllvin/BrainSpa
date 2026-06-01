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
        placeholder="What needs to be clearer?",
        hint="Ask for direct practical guidance.",
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
        label="DAILY NOTE",
        mode="generate",
        placeholder="",
        hint="One short operational note for today.",
    ),
    TestScenarioPublic(
        key="review",
        label="REVIEW",
        mode="chat",
        placeholder="This answer feels vague…",
        hint="Pressure-test an answer or plan.",
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

SCENARIOS_BY_MODEL: dict[str, list[TestScenarioPublic]] = {
    "starter_model": PERSONA_SCENARIOS,
    "coding_model": CODING_SCENARIOS,
}


def list_test_scenarios(model_key: str) -> list[TestScenarioPublic]:
    return SCENARIOS_BY_MODEL.get(model_key, PERSONA_SCENARIOS)


def scenario_generation_text(scenario_key: str, user_text: str) -> str:
    text = user_text.strip()
    if scenario_key == "daily-word":
        return "Give one short operational note for today. One or two sentences. Speak directly to the reader."
    if scenario_key == "advice":
        return f"Give practical, concrete guidance for this situation: {text}"
    if scenario_key == "review":
        return f"Review this answer for specificity, evidence, and next action: {text}"
    if scenario_key == "cli-task":
        return f"Answer as a coding worker with repo awareness and a verification step: {text}"
    return text
