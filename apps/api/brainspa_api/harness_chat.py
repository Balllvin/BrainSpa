from __future__ import annotations

import json

from .config import harness_chat_path, write_private_json
from .model_feedback import append_model_feedback_record
from .models import HarnessChatMessage, HarnessChatSendRequest, HarnessChatSendResult, HarnessChatThread
from .state import log_event


def read_harness_chat(model_key: str, scenario_key: str = "autonomous-train") -> HarnessChatThread:
    path = harness_chat_path(model_key, scenario_key)
    if not path.exists():
        return HarnessChatThread(model_key=model_key, scenario_key=scenario_key, messages=[])
    data = json.loads(path.read_text(encoding="utf-8"))
    messages = [HarnessChatMessage(**item) for item in data.get("messages", []) if isinstance(item, dict)]
    return HarnessChatThread(
        model_key=model_key,
        scenario_key=str(data.get("scenario_key") or scenario_key),
        messages=messages,
    )


def send_harness_chat(request: HarnessChatSendRequest) -> HarnessChatSendResult:
    scenario_key = request.scenario_key or "autonomous-train"
    thread = read_harness_chat(request.model_key, scenario_key)
    if request.reply_to_message_id is not None:
        return _save_reply_feedback(thread, request)

    user_message = HarnessChatMessage(
        id=_next_message_id(thread),
        role="user",
        content=request.text,
    )
    thread.messages.append(user_message)
    system_message = HarnessChatMessage(
        id=_next_message_id(thread),
        role="system",
        content="Snake Policy uses the interactive environment pages for testing and training. Chat harnesses are not shipped in this shell.",
    )
    thread.messages.append(system_message)
    _write_thread(thread)
    return HarnessChatSendResult(
        kind="assistant_reply",
        message=system_message,
        generation_state="blocked",
        missing_requirements=["Use /test/snake/autonomous-train or /test/snake/human-play for Snake Policy."],
    )


def _save_reply_feedback(thread: HarnessChatThread, request: HarnessChatSendRequest) -> HarnessChatSendResult:
    target = next((item for item in thread.messages if item.id == request.reply_to_message_id), None)
    if target is None or target.role != "assistant" or not target.prompt:
        system_message = HarnessChatMessage(
            id=_next_message_id(thread),
            role="system",
            content="Select an assistant reply to correct.",
        )
        thread.messages.append(system_message)
        _write_thread(thread)
        return HarnessChatSendResult(kind="feedback_saved", message=system_message, feedback_recorded=False)

    feedback_message = HarnessChatMessage(
        id=_next_message_id(thread),
        role="user",
        content=request.text,
        reply_to_message_id=target.id,
    )
    thread.messages.append(feedback_message)
    _write_thread(thread)
    artifact_path = append_model_feedback_record(
        {
            "stage": "evidence",
            "source": "harness_chat_reply_feedback",
            "model_key": request.model_key,
            "scenario_key": thread.scenario_key,
            "model": target.model,
            "prompt": target.prompt,
            "answer": target.content,
            "feedback": request.text,
            "dataset_use": "candidate_preference_or_correction_evidence",
            "harness_message_id": target.id,
            "feedback_message_id": feedback_message.id,
        }
    )
    log_event(
        "evidence.harness_chat_feedback",
        request.model_key,
        {
            "scenario_key": thread.scenario_key,
            "harness_message_id": target.id,
            "artifact_path": artifact_path,
        },
    )
    ack = HarnessChatMessage(
        id=_next_message_id(thread),
        role="system",
        content="Saved.",
    )
    thread.messages.append(ack)
    _write_thread(thread)
    return HarnessChatSendResult(kind="feedback_saved", message=ack, feedback_recorded=True)


def _next_message_id(thread: HarnessChatThread) -> int:
    if not thread.messages:
        return 1
    return max(message.id for message in thread.messages) + 1


def _write_thread(thread: HarnessChatThread) -> None:
    payload = {
        "model_key": thread.model_key,
        "scenario_key": thread.scenario_key,
        "messages": [message.model_dump() for message in thread.messages[-200:]],
    }
    write_private_json(harness_chat_path(thread.model_key, thread.scenario_key), payload)
