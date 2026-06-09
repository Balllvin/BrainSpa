from __future__ import annotations

import json
import ssl
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Protocol

from .config import model_feedback_path, runtime_root, telegram_config_path, write_private_json
from .model_feedback import append_model_feedback_record
from .models import EvalRunRequest, TelegramPollResult, TelegramPollerStatus
from .state import authorize_telegram_message, log_event, migrate_legacy_telegram_bots
from .workflows import chipmunk_reply, looks_like_loop_request, run_environment_eval

RESERVED_HERMES_BOT_NAMES = {"chipmunk"}


class TelegramClient(Protocol):
    def get_updates(self, token: str, offset: int | None = None, timeout: int = 0) -> list[dict[str, Any]]: ...

    def send_message(
        self,
        token: str,
        chat_id: str,
        text: str,
        reply_to_message_id: int | None = None,
    ) -> dict[str, Any]: ...


class TelegramHttpClient:
    def get_updates(self, token: str, offset: int | None = None, timeout: int = 0) -> list[dict[str, Any]]:
        payload: dict[str, Any] = {"timeout": timeout, "allowed_updates": ["message"]}
        if offset is not None:
            payload["offset"] = offset
        response = _telegram_request(token, "getUpdates", payload, timeout=timeout + 10)
        result = response.get("result", [])
        return result if isinstance(result, list) else []

    def send_message(
        self,
        token: str,
        chat_id: str,
        text: str,
        reply_to_message_id: int | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {"chat_id": chat_id, "text": text}
        if reply_to_message_id is not None:
            payload["reply_to_message_id"] = reply_to_message_id
        return _telegram_request(token, "sendMessage", payload, timeout=30)


class TelegramPoller:
    def __init__(self, interval_seconds: float = 2.5, client: TelegramClient | None = None) -> None:
        self.interval_seconds = interval_seconds
        self.client = client or TelegramHttpClient()
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._lock = threading.Lock()
        self._last_result = TelegramPollResult()
        self._last_error: str | None = None

    def start(self) -> None:
        with self._lock:
            if self._thread and self._thread.is_alive():
                return
            self._stop.clear()
            self._thread = threading.Thread(target=self._run, name="brain-spa-telegram-poller", daemon=True)
            self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        thread = self._thread
        if thread and thread.is_alive():
            thread.join(timeout=5)

    def status(self) -> TelegramPollerStatus:
        thread = self._thread
        return TelegramPollerStatus(
            running=bool(thread and thread.is_alive()),
            last_result=self._last_result,
            last_error=self._last_error,
        )

    def poll_once(self, timeout: int = 0) -> TelegramPollResult:
        with self._lock:
            try:
                result = poll_telegram_once(client=self.client, timeout=timeout)
                self._last_result = result
                self._last_error = None
                return result
            except Exception as error:
                self._last_error = str(error)
                raise

    def _run(self) -> None:
        while not self._stop.is_set():
            try:
                self.poll_once(timeout=20)
            except Exception as error:
                self._last_error = str(error)
                time.sleep(max(self.interval_seconds, 5))
                continue
            self._stop.wait(self.interval_seconds)


def poll_telegram_once(client: TelegramClient | None = None, timeout: int = 0) -> TelegramPollResult:
    migrate_legacy_telegram_bots()
    telegram_client = client or TelegramHttpClient()
    bots = _read_bot_records()
    offsets = _read_offsets()
    updates_seen = 0
    messages_sent = 0
    feedback_saved = 0
    skipped = 0
    errors: list[str] = []

    for bot in bots:
        if not bot.get("enabled") or not bot.get("live_verified"):
            continue
        bot_name = str(bot.get("name") or "")
        if bot_name.lower() in RESERVED_HERMES_BOT_NAMES:
            skipped += 1
            continue
        token = str(bot.get("bot_token") or "")
        offset = offsets.get(bot_name)
        try:
            updates = telegram_client.get_updates(token, offset=offset, timeout=timeout)
        except Exception as error:
            errors.append(f"{bot_name}: {error}")
            continue
        for update in updates:
            updates_seen += 1
            update_id = update.get("update_id")
            if isinstance(update_id, int):
                offsets[bot_name] = max(offsets.get(bot_name, 0), update_id + 1)
            message = update.get("message")
            if not isinstance(message, dict):
                skipped += 1
                continue
            outcome = _handle_message(bot, message, telegram_client)
            messages_sent += outcome["sent"]
            feedback_saved += outcome["feedback"]
            skipped += outcome["skipped"]

    _write_offsets(offsets)
    return TelegramPollResult(
        updates_seen=updates_seen,
        messages_sent=messages_sent,
        feedback_saved=feedback_saved,
        skipped=skipped,
        errors=errors,
    )


def telegram_messages_path() -> Path:
    return runtime_root() / "state" / "telegram-message-map.json"


def telegram_feedback_path() -> Path:
    return model_feedback_path()


def telegram_offsets_path() -> Path:
    return runtime_root() / "state" / "telegram-poller-state.json"


def _handle_message(bot: dict[str, Any], message: dict[str, Any], client: TelegramClient) -> dict[str, int]:
    bot_name = str(bot.get("name") or "")
    chat_id = str(message.get("chat", {}).get("id", ""))
    text = str(message.get("text") or message.get("caption") or "").strip()
    message_id = _int_or_none(message.get("message_id"))
    if not bot_name or not chat_id or not text or message_id is None:
        return {"sent": 0, "feedback": 0, "skipped": 1}

    authorized, reason = authorize_telegram_message(bot_name, chat_id)
    if not authorized:
        log_event("telegram.rejected", bot_name, {"chat_id": chat_id, "reason": reason})
        return {"sent": 0, "feedback": 0, "skipped": 1}

    reply_to_message_id = _int_or_none(message.get("reply_to_message", {}).get("message_id"))
    if reply_to_message_id is not None:
        saved = _save_feedback_if_model_reply(bot_name, chat_id, reply_to_message_id, message_id, text)
        if saved:
            return {"sent": 0, "feedback": 1, "skipped": 0}

    if _find_model_message_by_inbound(bot_name, chat_id, message_id):
        return {"sent": 0, "feedback": 0, "skipped": 1}

    answer, routed_to, model_name = _build_telegram_reply(bot_name, str(bot.get("model_key") or ""), text)
    response = client.send_message(str(bot["bot_token"]), chat_id, answer, reply_to_message_id=message_id)
    bot_message_id = _int_or_none(response.get("result", {}).get("message_id"))
    if bot_message_id is not None and not _is_chipmunk_bot(bot_name) and routed_to == str(bot.get("model_key") or "") and model_name:
        _record_model_message(
            {
                "bot_name": bot_name,
                "chat_id": chat_id,
                "user_message_id": message_id,
                "bot_message_id": bot_message_id,
                "model_key": str(bot.get("model_key") or ""),
                "model": model_name,
                "routed_to": routed_to,
                "prompt": text,
                "answer": answer,
            }
        )
    log_event("telegram.sent", bot_name, {"chat_id": chat_id, "message_id": bot_message_id, "routed_to": routed_to})
    return {"sent": 1, "feedback": 0, "skipped": 0}


def _build_telegram_reply(bot_name: str, model_key: str, text: str) -> tuple[str, str, str | None]:
    if not _is_chipmunk_bot(bot_name) and model_key and not looks_like_loop_request(text):
        if model_key == "snake_policy":
            return (
                "Snake Policy is an environment policy, not a shipped chat model. Use the Snake Test pages to run or train it.",
                "test",
                None,
            )
        return (
            "This public shell does not ship a text model runtime. Route loop work through Chipmunk or configure a local runtime.",
            "chipmunk",
            None,
        )
    route = chipmunk_reply(text)
    return route.reply, route.routed_to, None


def _is_chipmunk_bot(bot_name: str) -> bool:
    return bot_name.lower() in RESERVED_HERMES_BOT_NAMES


def _save_feedback_if_model_reply(
    bot_name: str,
    chat_id: str,
    reply_to_message_id: int,
    feedback_message_id: int,
    feedback: str,
) -> bool:
    record = _find_model_message(bot_name, chat_id, reply_to_message_id)
    if not record:
        return False
    payload = {
        "stage": "evidence",
        "source": "telegram_reply_feedback",
        "bot_name": bot_name,
        "chat_id": chat_id,
        "feedback_message_id": feedback_message_id,
        "bot_message_id": reply_to_message_id,
        "model_key": record.get("model_key"),
        "model": record.get("model"),
        "prompt": record.get("prompt"),
        "answer": record.get("answer"),
        "feedback": feedback,
        "dataset_use": "candidate_preference_or_correction_evidence",
    }
    feedback_path = append_model_feedback_record(payload)
    eval_result = run_environment_eval(
        EvalRunRequest(environment_key="snake_10x10", prompt=str(record.get("prompt") or ""), answer=str(record.get("answer") or ""))
    )
    log_event(
        "evidence.telegram_feedback",
        str(record.get("model_key") or bot_name),
        {
            "bot_name": bot_name,
            "chat_id": chat_id,
            "feedback_message_id": feedback_message_id,
            "score": eval_result.score,
            "artifact_path": feedback_path,
        },
    )
    return True


def _record_model_message(record: dict[str, Any]) -> None:
    payload = _read_message_map()
    messages = payload.setdefault("messages", [])
    messages.append(record)
    payload["messages"] = messages[-500:]
    write_private_json(telegram_messages_path(), payload)


def _find_model_message(bot_name: str, chat_id: str, bot_message_id: int) -> dict[str, Any] | None:
    for record in reversed(_read_message_map().get("messages", [])):
        if (
            record.get("bot_name") == bot_name
            and str(record.get("chat_id")) == str(chat_id)
            and int(record.get("bot_message_id", -1)) == bot_message_id
            and record.get("model_key")
        ):
            return record
    return None


def _find_model_message_by_inbound(bot_name: str, chat_id: str, user_message_id: int) -> dict[str, Any] | None:
    for record in reversed(_read_message_map().get("messages", [])):
        if (
            record.get("bot_name") == bot_name
            and str(record.get("chat_id")) == str(chat_id)
            and int(record.get("user_message_id", -1)) == user_message_id
        ):
            return record
    return None


def _read_message_map() -> dict[str, Any]:
    path = telegram_messages_path()
    if not path.exists():
        return {"messages": []}
    return json.loads(path.read_text(encoding="utf-8"))


def _read_bot_records() -> list[dict[str, Any]]:
    path = telegram_config_path()
    if not path.exists():
        return []
    data = json.loads(path.read_text(encoding="utf-8"))
    bots = data.get("bots", [])
    if isinstance(bots, dict):
        return [item for item in bots.values() if isinstance(item, dict)]
    return [item for item in bots if isinstance(item, dict)]


def _read_offsets() -> dict[str, int]:
    path = telegram_offsets_path()
    if not path.exists():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    return {str(key): int(value) for key, value in data.get("offsets", {}).items()}


def _write_offsets(offsets: dict[str, int]) -> None:
    write_private_json(telegram_offsets_path(), {"offsets": offsets})


def _telegram_request(token: str, method: str, payload: dict[str, Any], timeout: int) -> dict[str, Any]:
    request = urllib.request.Request(
        f"https://api.telegram.org/bot{token}/{method}",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout, context=_ssl_context()) as response:
            data = json.loads(response.read().decode("utf-8"))
    except (OSError, urllib.error.URLError, json.JSONDecodeError) as error:
        raise RuntimeError(f"Telegram {method} failed: {error}") from error
    if not data.get("ok"):
        raise RuntimeError(f"Telegram {method} returned not ok")
    return data


def _ssl_context() -> ssl.SSLContext:
    try:
        import certifi

        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        return ssl.create_default_context()


def _int_or_none(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None
