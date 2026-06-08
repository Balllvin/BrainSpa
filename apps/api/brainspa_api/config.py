from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any


def _load_env_file() -> None:
    path = Path.cwd() / ".env"
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip("\"'")
        if key and key not in os.environ:
            os.environ[key] = value


_load_env_file()


def runtime_root() -> Path:
    return Path(os.environ.get("BRAIN_SPA_HOME", Path.home() / ".brain-spa")).expanduser()


def state_path() -> Path:
    return runtime_root() / "state" / "brain-spa-state.json"


def event_log_path() -> Path:
    return runtime_root() / "state" / "brain-spa-events.sqlite3"


def telegram_config_path() -> Path:
    return runtime_root() / "secrets" / "telegram-bots.json"


def legacy_telegram_config_paths() -> list[Path]:
    candidates = [
        Path.home() / ".brain-spa-runtime" / "brain-spa-telegram-bots.json",
        runtime_root() / "secrets" / "brain-spa-telegram-bots.json",
    ]
    return [path for path in candidates if path.exists()]


def xai_api_key_path() -> Path:
    return runtime_root() / "secrets" / "xai-api-key"


def settings_path() -> Path:
    return runtime_root() / "state" / "app-settings.json"


def model_feedback_path() -> Path:
    return runtime_root() / "artifacts" / "evidence" / "telegram_feedback" / "feedback.jsonl"


def evidence_artifacts_dir() -> Path:
    return runtime_root() / "artifacts" / "evidence"


def evidence_notes_path() -> Path:
    return evidence_artifacts_dir() / "evidence_notes.json"


def source_claims_path() -> Path:
    return evidence_artifacts_dir() / "source_claims.jsonl"


def evidence_manifest_path() -> Path:
    return evidence_artifacts_dir() / "evidence_manifest.json"


def _safe_path_segment(value: str) -> str:
    return "".join(char if char.isalnum() or char in "-_" else "_" for char in value)


def harness_chat_path(model_key: str, scenario_key: str = "autonomous-train") -> Path:
    safe_model = _safe_path_segment(model_key)
    safe_scenario = _safe_path_segment(scenario_key)
    return runtime_root() / "state" / f"harness-chat-{safe_model}-{safe_scenario}.json"


def ensure_runtime_dirs() -> None:
    for path in (state_path().parent, event_log_path().parent, telegram_config_path().parent, runtime_root() / "artifacts"):
        path.mkdir(parents=True, exist_ok=True)
    telegram_config_path().parent.chmod(0o700)


def write_private_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_name(path.name + ".tmp")
    temp_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    os.chmod(temp_path, 0o600)
    temp_path.replace(path)
    os.chmod(path, 0o600)
