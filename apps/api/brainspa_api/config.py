from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any


def runtime_root() -> Path:
    return Path(os.environ.get("BRAIN_SPA_HOME", Path.home() / ".brain-spa")).expanduser()


def state_path() -> Path:
    return runtime_root() / "state" / "brain-spa-state.json"


def event_log_path() -> Path:
    return runtime_root() / "state" / "brain-spa-events.sqlite3"


def telegram_config_path() -> Path:
    return runtime_root() / "secrets" / "telegram-bots.json"


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
