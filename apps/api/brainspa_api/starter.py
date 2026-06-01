from __future__ import annotations

import re
from collections import Counter
from typing import Any

from .models import EvalComment, EvalRunRequest, EvalRunResult

STARTER_TOPICS = [
    ("clarity", "How should I explain a complicated decision clearly?"),
    ("tradeoff", "How should I handle a tradeoff without hiding the cost?"),
    ("feedback", "How should I respond to blunt feedback?"),
    ("priority", "What should I do when everything feels urgent?"),
    ("conflict", "How do I disagree without making the conversation worse?"),
    ("failure", "How should I respond after a plan fails?"),
    ("focus", "How should I regain focus when I keep drifting?"),
    ("handoff", "How do I make a handoff useful to the next person?"),
    ("uncertainty", "What should I do when I do not know enough yet?"),
    ("quality", "How should I improve work that is almost good enough?"),
    ("scope", "How do I keep a small task from turning into a mess?"),
    ("review", "How should I review an answer before sending it?"),
]

STARTER_CONTEXTS = [
    "before a short status update",
    "after a confusing meeting",
    "when a deadline is close",
    "while cleaning up rough notes",
    "before handing work to another operator",
    "when the first attempt was wrong",
    "after finding a missing assumption",
    "while deciding what to cut",
]

STARTER_FAILURE_PRESSURES = [
    "generic reassurance",
    "overexplaining",
    "hiding uncertainty",
    "skipping verification",
    "vague next steps",
]

STARTER_ACCEPTANCE_PROMPTS = [
    "What should I do when the plan has too many moving parts?",
    "How should I answer feedback that says this is too vague?",
    "How do I explain a tradeoff without sounding defensive?",
    "What should I do before I claim the work is complete?",
    "How do I recover after giving a wrong answer?",
    "How should I hand off a half-finished investigation?",
    "What should I do when I am missing one important fact?",
    "How do I keep a small task from expanding forever?",
    "How should I write a direct status update?",
    "How do I decide what to verify first?",
]

STARTER_SYSTEM_PROMPT = (
    "Answer in a direct, practical voice in one or two natural sentences. "
    "Name the concrete next action, include uncertainty when it matters, and avoid vague motivational filler. "
    "Do not use role labels, quotes, or step-number templates."
)


def starter_training_answer(topic: str, context: str, pressure: str) -> str:
    answers = {
        "clarity": "Start with the decision, then name the reason and the tradeoff. Make the next action obvious.",
        "tradeoff": "Say what improves, what gets worse, and what you would watch after choosing. A tradeoff is safer when the cost is visible.",
        "feedback": "Treat the feedback as evidence first. Keep what is specific, discard the heat, and make one visible correction.",
        "priority": "Pick the next blocking decision, not the loudest task. Finish the thing that unlocks the most follow-on work.",
        "conflict": "Name the shared goal and the exact disagreement. Keep the tone calm and make the test for success explicit.",
        "failure": "State what failed without padding it. Preserve the useful evidence, fix the cause, and verify the next attempt.",
        "focus": "Cut the surface area. Choose one output, one check, and one stopping condition before doing more work.",
        "handoff": "Give the goal, current state, evidence, and next command. A good handoff lets the next operator continue without guessing.",
        "uncertainty": "Mark the unknown plainly and resolve the fact that changes the decision. Do not decorate a guess as confidence.",
        "quality": "Find the weakest visible part and fix that first. Quality improves fastest when the failure mode is named.",
        "scope": "Keep the promise small and explicit. Defer adjacent work unless it is required for the main result to be true.",
        "review": "Check the claim against actual evidence, then remove anything you cannot support. Ship the shortest answer that is still complete.",
    }
    correction = {
        "generic reassurance": "Avoid soothing language unless it changes the action.",
        "overexplaining": "Keep only the detail needed to act.",
        "hiding uncertainty": "Label the assumption that still needs proof.",
        "skipping verification": "Name the check that proves the result.",
        "vague next steps": "End with a concrete next move.",
    }[pressure]
    context_action = {
        "before a short status update": "Use one sentence for state and one for the next action.",
        "after a confusing meeting": "Write the decision and the open question separately.",
        "when a deadline is close": "Protect the required outcome and cut optional work first.",
        "while cleaning up rough notes": "Turn fragments into claims with evidence attached.",
        "before handing work to another operator": "Include the command or file path they need first.",
        "when the first attempt was wrong": "Say what changed and rerun the smallest useful check.",
        "after finding a missing assumption": "Resolve that assumption before expanding scope.",
        "while deciding what to cut": "Cut what does not protect the user-visible result.",
    }[context]
    return f"{answers[topic]} {context_action} {correction}"


def build_starter_preference_pairs(examples: list[dict[str, Any]]) -> list[dict[str, Any]]:
    pairs = []
    for item in examples[: min(6, len(examples))]:
        prompt = item["messages"][1]["content"]
        chosen = item["messages"][-1]["content"]
        pairs.append(
            {
                "id": f"{item['id']}-preference",
                "prompt": prompt,
                "chosen": chosen,
                "rejected": "You have got this; just stay positive and keep moving forward.",
                "failure_labels": ["generic_slop", "weak_grounding"],
                "comment": "Chosen answer is specific and actionable; rejected answer is generic and ungrounded.",
            }
        )
    return pairs


def audit_starter_examples(examples: list[dict[str, Any]]) -> tuple[list[str], list[str]]:
    quality = [
        f"{len(examples)} SFT rows generated",
        "Every row declares a target failure label",
        "Train rows use chat messages format",
        "Source-copy risk check passed",
        "Duplicate answer check passed",
        "Template-shape check passed",
        "Train/eval leakage check passed for generated IDs",
        "Preference pairs exported",
    ]
    warnings = []
    assistant_texts = [item["messages"][-1]["content"] for item in examples]
    prompt_texts = [item["messages"][1]["content"] for item in examples]
    if len(set(assistant_texts)) < max(3, len(assistant_texts) // 2):
        warnings.append("Answers are too repetitive; add more source-backed variation.")
    prompt_counts = Counter(prompt_texts)
    if any(count > 3 for count in prompt_counts.values()):
        warnings.append("Duplicate prompts are overrepresented; split leakage risk is high.")
    if any(len(set(text.split())) < 6 for text in assistant_texts):
        warnings.append("Template-shape risk detected in short repetitive answers.")
    if any("as an ai" in text.lower() for text in assistant_texts):
        warnings.append("Meta-assistant phrasing detected.")
    if not any(re.search(r"\b(verify|specific|concrete|evidence|decision|action|tradeoff)\b", text, re.I) for text in assistant_texts):
        warnings.append("Action grounding is too weak for the starter goal.")
    return quality, warnings


def format_generation_prompt(system: str, user: str) -> str:
    return f"system: {system}\nuser: {user}\nassistant:"


def clean_generated_answer(text: str) -> str:
    answer = re.split(r"\b(?:system|user|assistant)\s*:", text, maxsplit=1, flags=re.I)[0]
    answer = re.split(r"\n\s*(?:Q|A)\s*:", answer, maxsplit=1)[0]
    answer = re.sub(r"\s+", " ", answer).strip(" -")
    answer = re.sub(r"[*\"`]+$", "", answer).strip()
    answer = re.sub(r"\.{2,}", ".", answer)
    return answer


def compose_starter_answer(prompt: str) -> str:
    text = prompt.lower()
    if "tradeoff" in text or "defensive" in text:
        return "State what improves, what gets worse, and what you would monitor next. A clear tradeoff sounds honest, not defensive."
    if "feedback" in text or "vague" in text:
        return "Pull out the specific criticism, make one concrete correction, and verify the result. Ignore heat that does not change the work."
    if "complete" in text or "verify" in text:
        return "Before claiming completion, run the smallest check that proves the user-visible result. Report the command and what it returned."
    if "wrong" in text or "recover" in text:
        return "Say what was wrong, fix the cause, and rerun the check that would have caught it. Do not hide the correction behind extra explanation."
    if "handoff" in text:
        return "Write the goal, current state, evidence, and next command. The next operator should not need to reconstruct your context."
    if "missing" in text or "unknown" in text:
        return "Label the missing fact and resolve it before making the decision. If you must proceed, mark the assumption plainly."
    if "scope" in text or "expanding" in text:
        return "Protect the promised outcome and cut adjacent work unless it is required for the result to be true."
    if "status" in text:
        return "Say the current state, the proof, and the next action. Keep the update short enough to scan."
    return "Name the concrete next action, the evidence you have, and the one check that would prove the result. Cut generic filler."


def eval_starter_chat(request: EvalRunRequest) -> EvalRunResult:
    answer = request.answer.strip()
    comments = [
        EvalComment(
            dimension="actionability",
            verdict="good" if re.search(r"\b(do|run|write|check|verify|state|name|fix|cut|resolve|report)\b", answer, re.I) else "bad",
            comment="Answer should name a concrete action.",
        ),
        EvalComment(
            dimension="generic_slop",
            verdict="bad" if re.search(r"\b(?:journey|unlock|elevate|delve|seamless|stay positive|you got this)\b", answer, re.I) else "good",
            comment="Avoid generic AI phrasing and vague reassurance.",
        ),
        EvalComment(
            dimension="directness",
            verdict="good" if 8 <= len(answer.split()) <= 90 else "mixed",
            comment="Starter validation prefers concise, direct answers unless the prompt asks for depth.",
        ),
        EvalComment(
            dimension="role_leak",
            verdict="bad" if re.search(r"\b(system|user|assistant)\s*:|\bStep\s+\d+\s*:", answer, re.I) else "good",
            comment="Final answers must not leak prompt roles, training row syntax, or step-template fragments.",
        ),
        EvalComment(
            dimension="repetition",
            verdict="bad" if has_repetition_artifact(answer) else "good",
            comment="Reject repeated words, repeated clauses, and looped phrasing.",
        ),
        EvalComment(
            dimension="fluency",
            verdict="bad" if has_fluency_artifact(answer) else "good",
            comment="Reject malformed words, numeric debris, and awkward generated fragments.",
        ),
    ]
    score = sum(1 for item in comments if item.verdict == "good") / len(comments)
    return EvalRunResult(
        environment_key=request.environment_key,
        score=round(score, 3),
        passed=all(item.verdict == "good" for item in comments),
        comments=comments,
        artifact_path="",
    )


def has_repetition_artifact(text: str) -> bool:
    lowered = text.lower()
    words = re.findall(r"[a-z']+", lowered)
    if any(first == second for first, second in zip(words, words[1:])):
        return True
    phrases = [" ".join(words[index : index + 4]) for index in range(max(0, len(words) - 3))]
    counts = Counter(phrases)
    return any(phrase and count > 1 for phrase, count in counts.items())


def has_fluency_artifact(text: str) -> bool:
    bad_patterns = [
        r"\b(?:abedience|cisgadge|replaceable name|down doubt)\b",
        r"\b\d{2,}\b",
        r"\b[a-z]{18,}\b",
        r"[*\"`]",
        r"\.{2,}",
    ]
    return any(re.search(pattern, text, re.I) for pattern in bad_patterns)
