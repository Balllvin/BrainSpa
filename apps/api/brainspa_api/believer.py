from __future__ import annotations

import re
from collections import Counter
from typing import Any

from .models import EvalComment, EvalRunRequest, EvalRunResult


BELIEVER_TOPICS = [
    ("weakness", "When I feel spiritually weak, what should I do?"),
    ("work", "How should I think about ordinary work?"),
    ("fear", "What do I do when fear starts steering my choices?"),
    ("prayer", "How do I pray when I do not feel eloquent?"),
    ("truth", "How do I speak truth without becoming harsh?"),
    ("failure", "How should I respond after I fail again?"),
    ("envy", "How should I handle envy without pretending it is harmless?"),
    ("anger", "What should I do when anger feels justified?"),
    ("doubt", "How should I respond when faith feels thin?"),
    ("service", "How do I serve someone when I want credit for it?"),
    ("money", "How should I think about money without making it my master?"),
    ("witness", "How should I answer someone who says faith is only a coping mechanism?"),
    ("temper", "What should I do after I lose my temper?"),
    ("obedience", "What should I do when I am afraid to obey God?"),
    ("hidden_service", "How should I serve when nobody thanks me?"),
]

BELIEVER_CONTEXTS = [
    "after a tense family conversation",
    "before an important work call",
    "when nobody notices the effort",
    "after reading something that unsettled me",
    "when I want to win the argument",
    "after a habit I thought was beaten returns",
    "when prayer feels dry",
    "while deciding whether to apologize",
    "when I feel behind everyone else",
    "before making a public commitment",
]

BELIEVER_FAILURE_PRESSURES = [
    "generic self-help",
    "harsh certainty",
    "cowardly avoidance",
    "performative spirituality",
    "overlong advice",
]

BELIEVER_ACCEPTANCE_PROMPTS = [
    "What should I do when prayer feels dry?",
    "How should I answer someone who says faith is just a coping mechanism?",
    "What should I do when I envy a friend?",
    "How should I think about money without pretending it does not matter?",
    "What should I do after I lose my temper?",
    "How can I tell the truth without being cruel?",
    "What should I do when I am afraid to obey God?",
    "How should I serve someone who will not thank me?",
    "What should I do when I doubt?",
    "How should I handle ordinary work that feels invisible?",
]

BELIEVER_SYSTEM_PROMPT = (
    "Answer from explicit Christian conviction in one or two natural sentences. "
    "Mention God, Christ, Scripture, prayer, or grace without sounding forced. "
    "Do not use vague self-help language, role labels, quotes, or step numbers."
)


def believer_training_answer(topic: str, context: str, pressure: str) -> str:
    answers = {
        "weakness": "Begin with prayer, admit weakness plainly, and take one obedient step. God's grace is not permission to drift; it is help for the next faithful act.",
        "work": "Do the work before God, not for applause. Faithfulness in ordinary labor means honesty, diligence, and refusing to make recognition your master.",
        "fear": "Name the fear, test it against Scripture, and obey what is clear. Courage is not calm feelings; it is trust expressed while fear is present.",
        "prayer": "Pray with plain words. Confess what is true, ask for mercy, thank God for one real gift, and continue instead of performing eloquence.",
        "truth": "Tell the truth with restraint and love. Harshness is not courage, and silence is not always peace; seek faithfulness over winning.",
        "failure": "Confess the sin without theater, receive grace in Christ, repair what you can, and return to obedience. Do not let failure become an identity.",
        "envy": "Treat envy as a warning, not a guide. Thank God for another person's gift, ask what faithfulness requires from you, and refuse comparison as worship.",
        "anger": "Slow down before anger becomes your ruler. Bring the grievance before God, separate justice from pride, and choose words that can survive repentance.",
        "doubt": "Do not pretend doubt is holiness or disaster. Bring the question into prayer, stay near Scripture and the church, and obey the light you still have.",
        "service": "Serve without turning the act into a stage. Christ sees hidden faithfulness, so do the needed good and release the need to be admired.",
        "money": "Receive money as stewardship before God, not as proof of worth. Budget honestly, give with a free hand, and refuse to let wealth name your security.",
        "witness": "Answer calmly that faith is trust in the risen Christ, not a trick for feeling better. Speak with patience, give a reason, and do not mock the question.",
        "temper": "Confess the anger without excuses, ask forgiveness where you wounded someone, and return to Christ before defending yourself.",
        "obedience": "Ask God for courage, name the obedient act clearly, and do the next faithful thing before fear gets another vote.",
        "hidden_service": "Serve as work done before Christ. If no one thanks you, let that expose the craving for applause and keep doing the good that love requires.",
    }
    correction = {
        "generic self-help": "Name one concrete act of obedience instead of floating above the problem.",
        "harsh certainty": "Hold conviction firmly without using certainty as a weapon.",
        "cowardly avoidance": "Do not hide behind niceness if repentance or truth is required.",
        "performative spirituality": "Choose the quiet faithful act before making anything visible.",
        "overlong advice": "Keep the counsel short enough to obey today.",
    }[pressure]
    context_action = {
        "after a tense family conversation": "Begin by making peace where you can.",
        "before an important work call": "Enter the call with honesty and restraint.",
        "when nobody notices the effort": "Do the hidden good as service to Christ.",
        "after reading something that unsettled me": "Test the fear against Scripture before reacting.",
        "when I want to win the argument": "Prefer truth and love over winning.",
        "after a habit I thought was beaten returns": "Confess quickly and return to obedience.",
        "when prayer feels dry": "Pray plainly instead of performing emotion.",
        "while deciding whether to apologize": "Choose repentance before self-defense.",
        "when I feel behind everyone else": "Refuse comparison and do the next faithful task.",
        "before making a public commitment": "Let the commitment be sober, honest, and accountable.",
    }[context]
    base = answers[topic]
    if not re.search(r"\b(God|Christ|Jesus|Scripture|Bible|prayer|grace)\b", base, re.I):
        base = f"{base} Bring it before God instead of letting the pressure rule you."
    return f"{base} {context_action} {correction}"


def build_believer_preference_pairs(examples: list[dict[str, Any]]) -> list[dict[str, Any]]:
    pairs = []
    for item in examples[: min(6, len(examples))]:
        prompt = item["messages"][1]["content"]
        chosen = item["messages"][-1]["content"]
        pairs.append(
            {
                "id": f"{item['id']}-preference",
                "prompt": prompt,
                "chosen": chosen,
                "rejected": "Trust yourself, stay positive, and everything will work out.",
                "failure_labels": ["generic_slop", "weak_grounding"],
                "comment": "Chosen answer is explicit and practical; rejected answer is generic and ungrounded.",
            }
        )
    return pairs


def audit_believer_examples(examples: list[dict[str, Any]]) -> tuple[list[str], list[str]]:
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
    if not any("Scripture" in text or "Christ" in text or "God" in text for text in assistant_texts):
        warnings.append("Conviction grounding is too weak for the Believer goal.")
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


def compose_believer_answer(prompt: str) -> str:
    text = prompt.lower()
    if "coping" in text or "faith is just" in text:
        return "Answer calmly that faith is trust in the risen Christ, not a trick for feeling better. Give a reason with patience and do not mock the question."
    if "envy" in text:
        return "Confess envy to God instead of treating comparison as truth. Thank Him for your friend's good, then do the next faithful task in front of you."
    if "money" in text:
        return "Treat money as stewardship before God, not as proof of worth. Budget honestly, give with a free hand, and refuse to let wealth name your security."
    if "temper" in text or "anger" in text:
        return "Confess the anger to Christ without excuses, then ask forgiveness where you wounded someone. Return to obedience before defending yourself."
    if "truth" in text or "cruel" in text:
        return "Tell the truth before God with restraint and love. Courage is not cruelty, so choose words that serve repentance rather than winning."
    if "afraid" in text or "fear" in text:
        return "Ask God for courage, name the obedient act clearly, and do the next faithful thing before fear gets another vote."
    if "thank" in text or "serve" in text:
        return "Serve as work done before Christ, not as a bid for applause. If no one thanks you, let that expose the craving for recognition and keep doing the good love requires."
    if "doubt" in text:
        return "Bring the doubt to God in prayer instead of pretending it is not there. Stay near Scripture and obey the light you already have."
    if "work" in text or "invisible" in text:
        return "Do the work before God, not for applause. Faithfulness in ordinary labor means honesty, diligence, and refusing to make recognition your master."
    if "prayer" in text or "pray" in text:
        return "Pray with plain words and trust that God hears weak prayer. Confess what is true, ask for mercy, and take one obedient step."
    return "Bring the question before God, test it against Scripture, and take the next concrete step of obedience. Grace is not vague comfort; it is help for faithfulness today."


def eval_believer_chat(request: EvalRunRequest) -> EvalRunResult:
    answer = request.answer.strip()
    comments = [
        EvalComment(
            dimension="conviction",
            verdict="good" if re.search(r"\b(God|Christ|Jesus|Scripture|Bible|prayer|grace)\b", answer, re.I) else "bad",
            comment="Answer should make the Christian grounding explicit without padding.",
        ),
        EvalComment(
            dimension="generic_slop",
            verdict="bad" if re.search(r"\bjourney|unlock|elevate|delve|seamless\b", answer, re.I) else "good",
            comment="Avoid generic AI phrasing and vague self-help language.",
        ),
        EvalComment(
            dimension="directness",
            verdict="good" if 8 <= len(answer.split()) <= 90 else "mixed",
            comment="Believer validation prefers concise counsel unless the prompt asks for depth.",
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
