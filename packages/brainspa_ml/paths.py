from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any


def runtime_root() -> Path:
    """Resolve the Brain Spa runtime home.

    Mirrors ``apps/api/brainspa_api/config.py`` so the ML core stays importable
    and testable without the API layer. Runtime data never lives in the repo.
    """

    return Path(os.environ.get("BRAIN_SPA_HOME", Path.home() / ".brain-spa")).expanduser()


def ml_root() -> Path:
    return runtime_root() / "artifacts" / "ml"


def runs_dir() -> Path:
    return ml_root() / "runs"


def datasets_dir() -> Path:
    return ml_root() / "datasets"


def models_dir() -> Path:
    return ml_root() / "models"


def ensure_ml_dirs() -> None:
    for path in (runs_dir(), datasets_dir(), models_dir()):
        path.mkdir(parents=True, exist_ok=True)


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(json.dumps(payload, indent=2, default=_json_default) + "\n", encoding="utf-8")
    tmp.replace(path)


def read_json(path: Path, default: Any = None) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return default


def _json_default(value: Any) -> Any:
    if isinstance(value, Path):
        return str(value)
    if hasattr(value, "tolist"):
        return value.tolist()
    if hasattr(value, "item"):
        return value.item()
    return str(value)
