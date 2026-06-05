from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .config import runtime_root


def sessions_dir() -> Path:
    path = runtime_root() / "artifacts" / "snake_sessions"
    path.mkdir(parents=True, exist_ok=True)
    return path


def archive_session(payload: dict[str, Any]) -> str:
    session_id = str(payload.get("session_id") or "unknown")
    path = sessions_dir() / f"{session_id}.json"
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return str(path)


def list_archived_sessions(*, limit: int = 50) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    for path in sorted(sessions_dir().glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            continue
        entries.append(
            {
                "session_id": payload.get("session_id"),
                "scenario_key": payload.get("scenario_key"),
                "episode_id": payload.get("episode_id"),
                "steps": len(payload.get("transitions") or []),
                "outcome": (payload.get("summary") or {}).get("outcome"),
                "archived_at": path.stat().st_mtime,
                "path": str(path),
            }
        )
        if len(entries) >= limit:
            break
    return entries


def load_archived_session(session_id: str) -> dict[str, Any] | None:
    path = sessions_dir() / f"{session_id}.json"
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None