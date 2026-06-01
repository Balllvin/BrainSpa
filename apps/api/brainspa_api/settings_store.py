from __future__ import annotations

import json
import shutil
from typing import Any, Literal

from .config import ensure_runtime_dirs, settings_path, write_private_json
from .models import AgentBackend, LoopAgentSettings, ModelTelegramLink
from .tools import detect_tools

LoopStageKey = Literal["evidence", "datasets", "tune", "test"]

LOOP_STAGE_DEFAULTS: list[dict[str, Any]] = [
    {"key": "evidence", "label": "Evidence", "backend": "grok", "telegram_bot_name": None},
    {"key": "datasets", "label": "Datasets", "backend": "opencode", "telegram_bot_name": None},
    {"key": "tune", "label": "Tune", "backend": "codex", "telegram_bot_name": None},
    {"key": "test", "label": "Test", "backend": "codex", "telegram_bot_name": None},
]

LOOP_CLI_BACKENDS = ("codex", "opencode", "grok", "cursor")
CONNECTABLE_BACKENDS = (*LOOP_CLI_BACKENDS, "hermes")


def default_settings() -> dict[str, Any]:
    return {
        "loop_agents": [dict(item) for item in LOOP_STAGE_DEFAULTS],
        "backend_auth": {},
        "model_telegram": {},
        "chipmunk": {
            "default_model_key": "starter_model",
            "default_telegram_bot_name": None,
            "voice_model": "grok-voice-think-fast-1.0",
        },
    }


def load_settings() -> dict[str, Any]:
    ensure_runtime_dirs()
    path = settings_path()
    if not path.exists():
        payload = default_settings()
        save_settings(payload)
        return payload
    payload = json.loads(path.read_text(encoding="utf-8"))
    seed = default_settings()
    changed = False
    for key, value in seed.items():
        if key not in payload:
            payload[key] = value
            changed = True
    existing_keys = {item["key"] for item in payload.get("loop_agents", [])}
    for item in LOOP_STAGE_DEFAULTS:
        if item["key"] not in existing_keys:
            payload.setdefault("loop_agents", []).append(dict(item))
            changed = True
    for item in payload.get("loop_agents", []):
        default = next((stage for stage in LOOP_STAGE_DEFAULTS if stage["key"] == item.get("key")), None)
        if default and item.get("backend") == "hermes":
            item["backend"] = default["backend"]
            changed = True
        old_defaults = {"evidence": "codex", "datasets": "codex", "test": "grok"}
        if default and item.get("backend") == old_defaults.get(str(item.get("key"))):
            item["backend"] = default["backend"]
            changed = True
    if changed:
        save_settings(payload)
    return sync_installed_backends(payload)


def save_settings(payload: dict[str, Any]) -> None:
    write_private_json(settings_path(), payload)


def loop_agents() -> list[LoopAgentSettings]:
    payload = load_settings()
    return [LoopAgentSettings(**item) for item in payload["loop_agents"]]


def update_loop_agent(
    stage_key: str,
    backend: AgentBackend | None,
    telegram_bot_name: str | None,
    *,
    clear_telegram: bool = False,
) -> LoopAgentSettings:
    payload = load_settings()
    updated: dict[str, Any] | None = None
    for item in payload["loop_agents"]:
        if item["key"] != stage_key:
            continue
        if backend is not None:
            item["backend"] = backend
        if clear_telegram or telegram_bot_name is not None:
            item["telegram_bot_name"] = telegram_bot_name or None
        updated = item
        break
    if updated is None:
        raise KeyError(f"Unknown loop stage: {stage_key}")
    save_settings(payload)
    return LoopAgentSettings(**updated)


def mark_backend_authenticated(backend_key: str, authenticated: bool = True) -> None:
    if backend_key not in CONNECTABLE_BACKENDS:
        raise KeyError(f"Unknown backend: {backend_key}")
    payload = load_settings()
    payload.setdefault("backend_auth", {})[backend_key] = authenticated
    save_settings(payload)


def probe_backend_ready(backend_key: str) -> bool:
    if backend_key == "hermes":
        tool = next((item for item in detect_tools() if item.key == "hermes"), None)
        return bool(tool and tool.available)
    if backend_key not in LOOP_CLI_BACKENDS:
        return False
    return shutil.which(backend_key) is not None


def sync_installed_backends(payload: dict[str, Any]) -> dict[str, Any]:
    auth = payload.setdefault("backend_auth", {})
    changed = False
    for key in CONNECTABLE_BACKENDS:
        ready = probe_backend_ready(key)
        if auth.get(key) != ready:
            auth[key] = ready
            changed = True
    if changed:
        save_settings(payload)
    return payload


def backend_is_connected(backend_key: str) -> bool:
    return probe_backend_ready(backend_key)


def model_telegram_links(models: list[dict[str, Any]]) -> list[ModelTelegramLink]:
    payload = load_settings()
    links = payload.get("model_telegram", {})
    return [
        ModelTelegramLink(
            model_key=model["key"],
            model_label=model["label"],
            model_state=model.get("state", "candidate"),
            telegram_bot_name=links.get(model["key"]),
        )
        for model in models
    ]


def update_model_telegram(
    model_key: str,
    telegram_bot_name: str | None,
    model_label: str,
    model_state: str = "candidate",
) -> ModelTelegramLink:
    payload = load_settings()
    payload.setdefault("model_telegram", {})[model_key] = telegram_bot_name
    save_settings(payload)
    return ModelTelegramLink(
        model_key=model_key,
        model_label=model_label,
        model_state=model_state,
        telegram_bot_name=telegram_bot_name,
    )


def build_backend_statuses() -> list[dict[str, Any]]:
    tools = {tool.key: tool for tool in detect_tools()}
    from .backend_connect import RECIPES

    statuses: list[dict[str, Any]] = []
    for key in CONNECTABLE_BACKENDS:
        tool = tools.get(key)
        installed = bool(tool and tool.available)
        statuses.append(
            {
                "key": key,
                "label": RECIPES[key].label,
                "installed": installed,
                "connected": backend_is_connected(key),
                "version": tool.version if tool else None,
                "command_path": tool.command_path if tool else None,
            }
        )
    return statuses


def chipmunk_settings() -> dict[str, Any]:
    from .state import get_xai_api_key
    from .chipmunk_hermes import read_chipmunk_hermes_status

    payload = load_settings()
    chipmunk = payload.get("chipmunk", default_settings()["chipmunk"])
    return {
        **chipmunk,
        "xai_configured": bool(get_xai_api_key()),
        "hermes": read_chipmunk_hermes_status().model_dump(),
    }


def update_chipmunk_settings(patch: dict[str, Any]) -> dict[str, Any]:
    from .chipmunk_hermes import restart_chipmunk_gateway, update_chipmunk_hermes_config
    from .models import ChipmunkHermesUpdate

    payload = load_settings()
    current = payload.setdefault("chipmunk", default_settings()["chipmunk"])
    for key in ("default_model_key", "default_telegram_bot_name", "voice_model"):
        if key in patch:
            current[key] = patch[key]
    if patch.get("hermes") is not None:
        update_chipmunk_hermes_config(ChipmunkHermesUpdate(**patch["hermes"]))
    save_settings(payload)
    if patch.get("restart_gateway"):
        restart_chipmunk_gateway()
    return chipmunk_settings()


def build_app_settings(models: list[dict[str, Any]], telegram_bots: list[Any]) -> dict[str, Any]:
    from .hermes_provider import list_hermes_providers

    loop = []
    for agent in loop_agents():
        loop.append(
            {
                **agent.model_dump(),
                "connected": backend_is_connected(agent.backend),
            }
        )
    return {
        "loop_agents": loop,
        "backends": build_backend_statuses(),
        "model_links": [link.model_dump() for link in model_telegram_links(models)],
        "telegram_bots": telegram_bots,
        "hermes_providers": [provider.model_dump() for provider in list_hermes_providers()],
        "chipmunk": chipmunk_settings(),
    }
