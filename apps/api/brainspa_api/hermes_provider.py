from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .models import HermesProviderConnectResult, HermesProviderStatus
from .state import get_xai_api_key


@dataclass(frozen=True)
class HermesProvider:
    key: str
    label: str
    auth_kind: str
    model: str
    base_url: str | None
    connect_label: str
    manual_command: str | None = None


PROVIDERS = (
    HermesProvider(
        key="openai-codex",
        label="OpenAI Codex",
        auth_kind="OAuth",
        model="gpt-5.5",
        base_url="https://chatgpt.com/backend-api/codex",
        connect_label="Import Codex CLI auth",
        manual_command="hermes auth add openai-codex",
    ),
    HermesProvider(
        key="xai",
        label="xAI Grok",
        auth_kind="API key",
        model="grok-4.3",
        base_url="https://api.x.ai/v1",
        connect_label="Use Brain Spa xAI key",
        manual_command="Set xAI key in Settings -> Chipmunk first.",
    ),
    HermesProvider(
        key="xai-oauth",
        label="xAI Grok OAuth",
        auth_kind="OAuth",
        model="grok-4.3",
        base_url="https://api.x.ai/v1",
        connect_label="Use Hermes OAuth",
        manual_command="hermes auth add xai-oauth",
    ),
    HermesProvider(
        key="copilot",
        label="GitHub Copilot",
        auth_kind="GitHub auth",
        model="gpt-5.5",
        base_url=None,
        connect_label="Use GitHub auth",
        manual_command="gh auth login",
    ),
    HermesProvider(
        key="openrouter",
        label="OpenRouter",
        auth_kind="API key",
        model="anthropic/claude-sonnet-4.6",
        base_url="https://openrouter.ai/api/v1",
        connect_label="Use OPENROUTER_API_KEY",
        manual_command="Set OPENROUTER_API_KEY in ~/.hermes/.env.",
    ),
    HermesProvider(
        key="anthropic",
        label="Anthropic",
        auth_kind="API key",
        model="anthropic/claude-sonnet-4.6",
        base_url="https://api.anthropic.com",
        connect_label="Use ANTHROPIC_API_KEY",
        manual_command="Set ANTHROPIC_API_KEY in ~/.hermes/.env.",
    ),
)

API_KEY_ENV = {
    "xai": "XAI_API_KEY",
    "openrouter": "OPENROUTER_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
}


def hermes_home() -> Path:
    return Path(os.environ.get("HERMES_HOME", Path.home() / ".hermes" / "profiles" / "chipmunk")).expanduser()


def codex_home() -> Path:
    return Path(os.environ.get("CODEX_HOME", Path.home() / ".codex")).expanduser()


def list_hermes_providers() -> list[HermesProviderStatus]:
    config = _read_model_config()
    active_provider = str(config.get("provider") or "")
    active_model = str(config.get("default") or "")
    return [_provider_status(provider, active_provider, active_model) for provider in PROVIDERS]


def connect_hermes_provider(provider_key: str) -> HermesProviderConnectResult:
    provider = _find_provider(provider_key)
    if provider.key == "openai-codex":
        tokens = _read_codex_cli_tokens()
        if not tokens:
            return _blocked(provider, "No usable Codex CLI auth found at ~/.codex/auth.json.")
        _write_hermes_provider_auth("openai-codex", {"tokens": tokens, "auth_mode": "chatgpt"})
        _write_model_config(provider)
        status = _provider_status(provider, provider.key, provider.model)
        return HermesProviderConnectResult(connected=True, provider=status, message="Imported Codex CLI auth into Hermes.")
    if provider.key == "xai":
        key = get_xai_api_key()
        if not key:
            return _blocked(provider, "No Brain Spa xAI key is saved.")
        _upsert_env_value("XAI_API_KEY", key)
        _write_model_config(provider)
        status = _provider_status(provider, provider.key, provider.model)
        return HermesProviderConnectResult(connected=True, provider=status, message="Synced Brain Spa xAI key into Hermes.")
    if not _provider_status(provider, "", "").configured:
        return _blocked(provider, f"{provider.label} is not authenticated in Hermes.")
    _write_model_config(provider)
    status = _provider_status(provider, provider.key, provider.model)
    return HermesProviderConnectResult(connected=True, provider=status, message=f"Selected {provider.label} for Hermes.")


def _blocked(provider: HermesProvider, reason: str) -> HermesProviderConnectResult:
    status = _provider_status(provider, "", "")
    status.blocked_reason = reason
    return HermesProviderConnectResult(connected=False, provider=status, message=reason)


def _provider_status(provider: HermesProvider, active_provider: str, active_model: str) -> HermesProviderStatus:
    configured = _provider_configured(provider.key)
    return HermesProviderStatus(
        key=provider.key,
        label=provider.label,
        auth_kind=provider.auth_kind,
        configured=configured,
        active=active_provider == provider.key,
        model=active_model if active_provider == provider.key and active_model else provider.model,
        connect_label=provider.connect_label,
        blocked_reason=None if configured else _provider_blocker(provider),
        manual_command=provider.manual_command,
    )


def _find_provider(provider_key: str) -> HermesProvider:
    for provider in PROVIDERS:
        if provider.key == provider_key:
            return provider
    raise KeyError(f"Unknown Hermes provider: {provider_key}")


def _provider_configured(provider_key: str) -> bool:
    if provider_key in API_KEY_ENV:
        return bool(_read_env_value(API_KEY_ENV[provider_key]))
    if provider_key in {"openai-codex", "xai-oauth"}:
        state = _read_hermes_auth().get("providers", {}).get(provider_key, {})
        tokens = state.get("tokens") if isinstance(state, dict) else None
        if isinstance(tokens, dict) and bool(tokens.get("access_token")) and bool(tokens.get("refresh_token")):
            return True
        pool = _read_hermes_auth().get("credential_pool", {}).get(provider_key)
        return bool(pool)
    if provider_key == "copilot":
        pool = _read_hermes_auth().get("credential_pool", {}).get("copilot")
        return bool(pool)
    return False


def _provider_blocker(provider: HermesProvider) -> str:
    if provider.key == "openai-codex":
        return "Import Codex CLI auth or run Hermes OAuth."
    if provider.key == "xai":
        return "Save an xAI key in Settings -> Chipmunk."
    return provider.manual_command or "Configure this provider in Hermes."


def _read_model_config() -> dict[str, str]:
    path = hermes_home() / "config.yaml"
    if not path.exists():
        return {}
    text = path.read_text(encoding="utf-8")
    model_block = re.search(r"(?m)^model:\n(?P<body>(?:  [^\n]+\n?)*)", text)
    if not model_block:
        return {}
    result: dict[str, str] = {}
    for line in model_block.group("body").splitlines():
        if ":" not in line:
            continue
        key, value = line.strip().split(":", 1)
        result[key.strip()] = value.strip().strip("'\"")
    return result


def _write_model_config(provider: HermesProvider) -> None:
    path = hermes_home() / "config.yaml"
    path.parent.mkdir(parents=True, exist_ok=True)
    existing = path.read_text(encoding="utf-8") if path.exists() else ""
    model_lines = [
        "model:",
        f"  default: {provider.model}",
        f"  provider: {provider.key}",
    ]
    if provider.base_url:
        model_lines.append(f"  base_url: {provider.base_url}")
    model_block = "\n".join(model_lines) + "\n"
    if re.search(r"(?m)^model:\n(?:  [^\n]+\n?)*", existing):
        updated = re.sub(r"(?m)^model:\n(?:  [^\n]+\n?)*", model_block, existing, count=1)
    else:
        updated = model_block + existing
    path.write_text(updated, encoding="utf-8")


def _read_hermes_auth() -> dict[str, Any]:
    path = hermes_home() / "auth.json"
    if not path.exists():
        return {"version": 1, "providers": {}, "credential_pool": {}}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {"version": 1, "providers": {}, "credential_pool": {}}
    payload.setdefault("providers", {})
    payload.setdefault("credential_pool", {})
    return payload


def _write_hermes_provider_auth(provider_key: str, state: dict[str, Any]) -> None:
    path = hermes_home() / "auth.json"
    payload = _read_hermes_auth()
    payload.setdefault("providers", {})[provider_key] = state
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    path.chmod(0o600)


def _read_codex_cli_tokens() -> dict[str, str] | None:
    path = codex_home() / "auth.json"
    if not path.exists():
        return None
    try:
        tokens = json.loads(path.read_text(encoding="utf-8")).get("tokens")
    except json.JSONDecodeError:
        return None
    if not isinstance(tokens, dict):
        return None
    access = tokens.get("access_token")
    refresh = tokens.get("refresh_token")
    if not access or not refresh:
        return None
    return {"access_token": str(access), "refresh_token": str(refresh)}


def _read_env_value(key: str) -> str | None:
    if os.environ.get(key):
        return os.environ[key]
    path = hermes_home() / ".env"
    if not path.exists():
        return None
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip().startswith(f"{key}="):
            return line.split("=", 1)[1].strip()
    return None


def _upsert_env_value(key: str, value: str) -> None:
    path = hermes_home() / ".env"
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = path.read_text(encoding="utf-8").splitlines() if path.exists() else []
    replaced = False
    next_lines = []
    for line in lines:
        if line.strip().startswith(f"{key}="):
            next_lines.append(f"{key}={value}")
            replaced = True
        else:
            next_lines.append(line)
    if not replaced:
        next_lines.append(f"{key}={value}")
    path.write_text("\n".join(next_lines) + "\n", encoding="utf-8")
    path.chmod(0o600)
