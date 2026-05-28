from __future__ import annotations

import json
import shutil
import subprocess
from collections.abc import Iterator
from dataclasses import dataclass

from .settings_store import LOOP_CLI_BACKENDS, mark_backend_authenticated, probe_backend_ready

__all__ = ["connect_backend_stream", "RECIPES", "probe_backend_ready"]


@dataclass(frozen=True)
class BackendRecipe:
    label: str
    install_shell: str | None


RECIPES: dict[str, BackendRecipe] = {
    "hermes": BackendRecipe(label="Hermes Agent", install_shell=None),
    "codex": BackendRecipe(label="Codex CLI", install_shell="npm install -g @openai/codex@latest"),
    "opencode": BackendRecipe(
        label="OpenCode CLI",
        install_shell="curl -fsSL https://opencode.ai/install.sh | bash",
    ),
    "grok": BackendRecipe(
        label="Grok CLI",
        install_shell="brew install xai-org/tap/grok || brew install grok",
    ),
    # Cursor: install from the app menu; `cursor --install-cli` hangs when not on PATH.
    "cursor": BackendRecipe(label="Cursor CLI", install_shell=None),
}


def connect_backend_stream(backend_key: str) -> Iterator[str]:
    if backend_key not in LOOP_CLI_BACKENDS:
        yield _event("error", f"{backend_key} is not installable from settings.")
        return

    recipe = RECIPES[backend_key]
    if probe_backend_ready(backend_key):
        mark_backend_authenticated(backend_key, True)
        yield _event("done", f"{recipe.label} is already installed and ready.")
        return

    yield _event("log", f"Installing {recipe.label}…")
    if not recipe.install_shell:
        if backend_key == "cursor":
            yield _event(
                "error",
                "Install from the Cursor app: Cmd+Shift+P → Shell Command: Install 'cursor' command in PATH.",
            )
        else:
            yield _event("error", f"No install script for {recipe.label}.")
        return

    for line in _run_shell(recipe.install_shell):
        yield _event("log", line)

    if probe_backend_ready(backend_key):
        mark_backend_authenticated(backend_key, True)
        yield _event(
            "done",
            f"{recipe.label} installed. Use your existing terminal sign-in if prompted.",
        )
    else:
        yield _event(
            "error",
            f"Install finished but `{backend_key}` is still not on PATH. Restart the terminal, then reload.",
        )


def _run_shell(command: str, timeout_sec: int = 180) -> Iterator[str]:
    process = subprocess.Popen(
        ["bash", "-lc", command],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    assert process.stdout is not None
    for line in process.stdout:
        cleaned = line.rstrip()
        if cleaned:
            yield cleaned
    try:
        exit_code = process.wait(timeout=timeout_sec)
    except subprocess.TimeoutExpired:
        process.kill()
        yield f"Install timed out after {timeout_sec}s."
        return
    if exit_code != 0:
        yield f"Command exited with code {exit_code}."


def _event(kind: str, message: str) -> str:
    return f"data: {json.dumps({'type': kind, 'message': message})}\n\n"
