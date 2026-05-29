from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import Any

from .config import runtime_root
from .models import TrainingAdapterBuildResult, TrainingDryRunRequest, TuneBuildJob
from .workflows import build_training_adapter, project_key_for_model

_BUILD_THREADS: dict[str, threading.Thread] = {}
_BUILD_LOCK = threading.Lock()


def _job_path(project_key: str) -> Path:
    return runtime_root() / "artifacts" / "training" / project_key / "build_job.json"


def _write_job(project_key: str, payload: dict[str, Any]) -> None:
    path = _job_path(project_key)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def read_build_job(project_key: str) -> TuneBuildJob | None:
    path = _job_path(project_key)
    if not path.exists():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None
    result = payload.get("result")
    return TuneBuildJob(
        state=str(payload.get("state") or "idle"),
        phase=str(payload.get("phase") or "idle"),
        model_key=str(payload.get("model_key") or ""),
        dataset_key=str(payload.get("dataset_key") or ""),
        training_preset=str(payload.get("training_preset") or "standard"),
        result=TrainingAdapterBuildResult(**result) if isinstance(result, dict) else None,
        error=payload.get("error"),
    )


def read_build_job_for_slug(model_slug: str) -> TuneBuildJob | None:
    from .tune_api import tune_status_for_slug

    status = tune_status_for_slug(model_slug)
    return read_build_job(status.project_key)


def start_build_job(request: TrainingDryRunRequest) -> TuneBuildJob:
    project_key = request.project_key or project_key_for_model(request.model_key)
    preset = request.training_preset or "standard"

    with _BUILD_LOCK:
        existing = read_build_job(project_key)
        if existing and existing.state == "running":
            return existing

        _write_job(
            project_key,
            {
                "state": "running",
                "phase": "starting",
                "model_key": request.model_key,
                "dataset_key": request.dataset_key,
                "training_preset": preset,
                "result": None,
                "error": None,
            },
        )

        def run() -> None:
            progress_path = _job_path(project_key)

            def on_phase(phase: str) -> None:
                current = read_build_job(project_key)
                if current and current.state == "running":
                    _write_job(
                        project_key,
                        {
                            "state": "running",
                            "phase": phase,
                            "model_key": request.model_key,
                            "dataset_key": request.dataset_key,
                            "training_preset": preset,
                            "result": None,
                            "error": None,
                        },
                    )

            try:
                result = build_training_adapter(request, progress_path=progress_path, on_phase=on_phase)
                final_state = "complete" if result.state == "complete" else "blocked"
                _write_job(
                    project_key,
                    {
                        "state": final_state,
                        "phase": "done" if final_state == "complete" else "blocked",
                        "model_key": request.model_key,
                        "dataset_key": request.dataset_key,
                        "training_preset": preset,
                        "result": result.model_dump(),
                        "error": None,
                    },
                )
            except Exception as error:  # noqa: BLE001 — surface to job file for UI
                _write_job(
                    project_key,
                    {
                        "state": "failed",
                        "phase": "failed",
                        "model_key": request.model_key,
                        "dataset_key": request.dataset_key,
                        "training_preset": preset,
                        "result": None,
                        "error": str(error),
                    },
                )
            finally:
                with _BUILD_LOCK:
                    _BUILD_THREADS.pop(project_key, None)

        thread = threading.Thread(target=run, daemon=True)
        _BUILD_THREADS[project_key] = thread
        thread.start()

    return read_build_job(project_key) or TuneBuildJob(
        state="running",
        phase="starting",
        model_key=request.model_key,
        dataset_key=request.dataset_key,
        training_preset=preset,
    )
