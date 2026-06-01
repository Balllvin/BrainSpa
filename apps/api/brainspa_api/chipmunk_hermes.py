from __future__ import annotations

import json
import os
import re
import subprocess
from pathlib import Path
from typing import Any

from .models import ChipmunkHermesStatus, ChipmunkHermesUpdate


LAUNCH_AGENT_LABEL = "ai.brainspa.chipmunk-hermes"
PROFILE_NAME = "chipmunk"


def chipmunk_profile_path() -> Path:
    return Path.home() / ".hermes" / "profiles" / PROFILE_NAME


def chipmunk_config_path() -> Path:
    return chipmunk_profile_path() / "config.yaml"


def chipmunk_env_path() -> Path:
    return chipmunk_profile_path() / ".env"


def chipmunk_auth_path() -> Path:
    return chipmunk_profile_path() / "auth.json"


def read_chipmunk_hermes_status() -> ChipmunkHermesStatus:
    config_text = _read_text(chipmunk_config_path())
    env_text = _read_text(chipmunk_env_path())
    launch = _read_launch_agent()
    provider = _config_value(config_text, "model", "provider") or ""
    model = _config_value(config_text, "model", "default") or ""
    return ChipmunkHermesStatus(
        profile=PROFILE_NAME,
        profile_path=str(chipmunk_profile_path()),
        config_path=str(chipmunk_config_path()),
        env_path=str(chipmunk_env_path()),
        launch_agent_label=LAUNCH_AGENT_LABEL,
        gateway_running=launch["running"],
        gateway_pid=launch["pid"],
        gateway_state=launch["state"],
        gateway_last_exit_code=launch["last_exit_code"],
        provider=provider,
        model=model,
        base_url=_config_value(config_text, "model", "base_url") or "",
        reasoning_effort=_config_value(config_text, "agent", "reasoning_effort") or "medium",
        service_tier=_normal_service_tier(_config_value(config_text, "agent", "service_tier")),
        max_turns=_int_config(config_text, "agent", "max_turns"),
        gateway_timeout=_int_config(config_text, "agent", "gateway_timeout"),
        terminal_cwd=_config_value(config_text, "terminal", "cwd") or "",
        telegram_token_configured=_env_has(env_text, "TELEGRAM_BOT_TOKEN"),
        telegram_allowed_users=_env_value(env_text, "TELEGRAM_ALLOWED_USERS"),
        telegram_home_channel=_env_value(env_text, "TELEGRAM_HOME_CHANNEL"),
        openai_codex_configured=_auth_provider_configured("openai-codex"),
        xai_api_key_synced=_env_has(env_text, "XAI_API_KEY"),
        toolsets=_yaml_list(config_text, "toolsets"),
        telegram_toolsets=_platform_toolsets(config_text, "telegram"),
        recent_provider_error=_recent_provider_error(),
    )


def update_chipmunk_hermes_config(update: ChipmunkHermesUpdate) -> ChipmunkHermesStatus:
    config_path = chipmunk_config_path()
    config_path.parent.mkdir(parents=True, exist_ok=True)
    config_text = _read_text(config_path)
    if not config_text:
        config_text = "model:\nagent:\nterminal:\n"

    values = update.model_dump(exclude_unset=True)
    if update.provider is not None:
        config_text = _set_config_value(config_text, "model", "provider", update.provider)
    if update.model is not None:
        config_text = _set_config_value(config_text, "model", "default", update.model, quote=True)
    if update.base_url is not None:
        config_text = _set_config_value(config_text, "model", "base_url", update.base_url, quote=True)
    if update.reasoning_effort is not None:
        config_text = _set_config_value(config_text, "agent", "reasoning_effort", update.reasoning_effort)
    if update.service_tier is not None:
        config_text = _set_config_value(config_text, "agent", "service_tier", update.service_tier)
    if update.max_turns is not None:
        config_text = _set_config_value(config_text, "agent", "max_turns", str(update.max_turns))
    if update.gateway_timeout is not None:
        config_text = _set_config_value(config_text, "agent", "gateway_timeout", str(update.gateway_timeout))
    if "telegram_allowed_users" in values:
        _upsert_env_value("TELEGRAM_ALLOWED_USERS", update.telegram_allowed_users or "")
    if "telegram_home_channel" in values:
        _upsert_env_value("TELEGRAM_HOME_CHANNEL", update.telegram_home_channel or "")

    config_path.write_text(config_text, encoding="utf-8")
    return read_chipmunk_hermes_status()


def sync_chipmunk_xai_key(api_key: str | None) -> None:
    if api_key:
        _upsert_env_value("XAI_API_KEY", api_key)
    else:
        _remove_env_value("XAI_API_KEY")


def restart_chipmunk_gateway() -> ChipmunkHermesStatus:
    try:
        subprocess.run(
            ["launchctl", "kickstart", "-k", f"gui/{os.getuid()}/{LAUNCH_AGENT_LABEL}"],
            check=False,
            text=True,
            capture_output=True,
        )
    except OSError:
        pass
    return read_chipmunk_hermes_status()


def _read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except OSError:
        return ""


def _section_body(text: str, section: str) -> tuple[re.Match[str] | None, str]:
    match = re.search(rf"(?m)^{re.escape(section)}:\n(?P<body>(?:  [^\n]+\n?)*)", text)
    return match, match.group("body") if match else ""


def _config_value(text: str, section: str, key: str) -> str | None:
    _, body = _section_body(text, section)
    for line in body.splitlines():
        stripped = line.strip()
        if not stripped.startswith(f"{key}:"):
            continue
        value = stripped.split(":", 1)[1].strip()
        return value.strip("'\"")
    return None


def _int_config(text: str, section: str, key: str) -> int | None:
    value = _config_value(text, section, key)
    try:
        return int(value) if value is not None else None
    except ValueError:
        return None


def _set_config_value(text: str, section: str, key: str, value: str, *, quote: bool = False) -> str:
    rendered = f'"{value}"' if quote else value
    line = f"  {key}: {rendered}"
    match, body = _section_body(text, section)
    if not match:
        prefix = "" if text.endswith("\n") or not text else "\n"
        return f"{text}{prefix}{section}:\n{line}\n"
    lines = body.splitlines()
    replaced = False
    for idx, existing in enumerate(lines):
        if existing.strip().startswith(f"{key}:"):
            lines[idx] = line
            replaced = True
            break
    if not replaced:
        lines.append(line)
    replacement = f"{section}:\n" + "\n".join(lines) + "\n"
    return text[: match.start()] + replacement + text[match.end() :]


def _normal_service_tier(value: str | None) -> str:
    normalized = str(value or "").strip().lower()
    if normalized in {"fast", "priority", "on"}:
        return "fast"
    return "normal"


def _env_value(text: str, key: str) -> str | None:
    for line in text.splitlines():
        if line.startswith(f"{key}="):
            value = line.split("=", 1)[1].strip()
            return value or None
    return None


def _env_has(text: str, key: str) -> bool:
    return bool(_env_value(text, key))


def _upsert_env_value(key: str, value: str) -> None:
    path = chipmunk_env_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = _read_text(path).splitlines()
    next_line = f"{key}={value}"
    replaced = False
    for idx, line in enumerate(lines):
        if line.startswith(f"{key}="):
            lines[idx] = next_line
            replaced = True
            break
    if not replaced:
        lines.append(next_line)
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
    path.chmod(0o600)


def _remove_env_value(key: str) -> None:
    path = chipmunk_env_path()
    if not path.exists():
        return
    lines = [line for line in path.read_text(encoding="utf-8").splitlines() if not line.startswith(f"{key}=")]
    path.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
    path.chmod(0o600)


def _read_launch_agent() -> dict[str, Any]:
    try:
        result = subprocess.run(
            ["launchctl", "print", f"gui/{os.getuid()}/{LAUNCH_AGENT_LABEL}"],
            check=False,
            text=True,
            capture_output=True,
            timeout=5,
        )
    except (OSError, subprocess.TimeoutExpired):
        return {
            "running": False,
            "pid": None,
            "state": "unavailable",
            "last_exit_code": None,
        }
    output = result.stdout + result.stderr
    state = _match_value(output, r"\bstate = ([^\n]+)") or "unknown"
    pid_raw = _match_value(output, r"\bpid = (\d+)")
    return {
        "running": "state = running" in output,
        "pid": int(pid_raw) if pid_raw else None,
        "state": state.strip(),
        "last_exit_code": _match_value(output, r"\blast exit code = ([^\n]+)"),
    }


def _match_value(text: str, pattern: str) -> str | None:
    match = re.search(pattern, text)
    return match.group(1).strip() if match else None


def _auth_provider_configured(provider: str) -> bool:
    try:
        payload = json.loads(chipmunk_auth_path().read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return False
    state = payload.get("providers", {}).get(provider, {})
    tokens = state.get("tokens") if isinstance(state, dict) else None
    if isinstance(tokens, dict) and tokens.get("access_token") and tokens.get("refresh_token"):
        return True
    pool = payload.get("credential_pool", {}).get(provider, [])
    return bool(pool)


def _yaml_list(text: str, section: str) -> list[str]:
    _, body = _section_body(text, section)
    values: list[str] = []
    for line in body.splitlines():
        stripped = line.strip()
        if stripped.startswith("- "):
            values.append(stripped[2:].strip("'\""))
    return values


def _platform_toolsets(text: str, platform: str) -> list[str]:
    _, body = _section_body(text, "platform_toolsets")
    for line in body.splitlines():
        stripped = line.strip()
        if not stripped.startswith(f"{platform}:"):
            continue
        _, raw = stripped.split(":", 1)
        raw = raw.strip()
        if raw.startswith("[") and raw.endswith("]"):
            return [item.strip().strip("'\"") for item in raw[1:-1].split(",") if item.strip()]
    return []


def _recent_provider_error() -> str | None:
    path = chipmunk_profile_path() / "logs" / "errors.log"
    if not path.exists():
        return None
    for line in reversed(path.read_text(errors="replace").splitlines()[-300:]):
        if "API call failed" in line or "Non-retryable client error" in line:
            return re.sub(r"(access_token[=:] ?|refresh_token[=:] ?).+", r"\1[REDACTED]", line)[-400:]
    return None
