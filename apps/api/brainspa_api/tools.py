from __future__ import annotations

import shutil
import subprocess

from .models import ToolStatus


TOOL_LABELS = {
    "codex": "Codex CLI",
    "opencode": "OpenCode CLI",
    "grok": "Grok CLI",
    "cursor": "Cursor",
    "hermes": "Hermes Agent",
}

SETUP_HINTS = {
    "cursor": "Install or expose Cursor's CLI on PATH before assigning Cursor-backed work.",
    "hermes": "Install Hermes Agent, then run the Brain Spa Chipmunk setup flow.",
}

VERSION_COMMANDS = {
    "codex": ["codex", "--version"],
    "opencode": ["opencode", "--version"],
    "grok": ["grok", "--version"],
    "cursor": ["cursor", "--version"],
}


def detect_tools() -> list[ToolStatus]:
    statuses: list[ToolStatus] = []
    for key in ("codex", "opencode", "grok", "cursor", "hermes"):
        command_path = shutil.which(key)
        statuses.append(
            ToolStatus(
                key=key,
                label=TOOL_LABELS[key],
                available=command_path is not None,
                command_path=command_path,
                version=_read_version(key) if command_path and key != "hermes" else None,
                setup_hint=None if command_path else SETUP_HINTS.get(key),
            )
        )
    return statuses


def _read_version(key: str) -> str | None:
    try:
        command = VERSION_COMMANDS.get(key)
        if not command:
            return None
        result = subprocess.run(command, text=True, capture_output=True, timeout=0.75, check=False)
    except (OSError, subprocess.TimeoutExpired):
        return None

    output = (result.stdout or result.stderr).strip()
    if not output:
        return None
    return output.splitlines()[0][:120]
