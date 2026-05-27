from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class WorkerPreview:
    agent_key: str
    backend: str
    task: str

    def command_preview(self) -> list[str]:
        return [self.backend, self.task]

