"""Run / experiment registry.

Every training job is a *run* with a stable id, status, hyperparameters, a
streamed metric series, and a final summary. Runs are plain JSON under
``~/.brain-spa/artifacts/ml/runs/<id>`` so they survive restarts, can be listed
and compared, and never touch the git repo.
"""

from __future__ import annotations

import threading
import time
from pathlib import Path
from typing import Any

from .paths import read_json, runs_dir, write_json

_LOCK = threading.Lock()
_COUNTER_FILE = "_counter.json"


def _next_run_id() -> str:
    root = runs_dir()
    root.mkdir(parents=True, exist_ok=True)
    counter_path = root / _COUNTER_FILE
    with _LOCK:
        data = read_json(counter_path, {"n": 0}) or {"n": 0}
        data["n"] = int(data.get("n", 0)) + 1
        write_json(counter_path, data)
        n = data["n"]
    return f"run-{n:04d}"


def _run_dir(run_id: str) -> Path:
    return runs_dir() / run_id


def _run_path(run_id: str) -> Path:
    return _run_dir(run_id) / "run.json"


def _metrics_path(run_id: str) -> Path:
    return _run_dir(run_id) / "metrics.jsonl"


def create_run(
    *,
    kind: str,
    algo: str,
    label: str,
    target: dict[str, Any],
    hyperparams: dict[str, Any],
) -> dict[str, Any]:
    run_id = _next_run_id()
    now = time.time()
    record = {
        "id": run_id,
        "kind": kind,  # "rl" | "supervised"
        "algo": algo,
        "label": label,
        "target": target,  # {"env_id": ...} or {"dataset_id":..., "task":...}
        "hyperparams": hyperparams,
        "status": "queued",
        "created_at": now,
        "updated_at": now,
        "metric_count": 0,
        "last_metric": None,
        "summary": None,
        "error": None,
        "checkpoint_path": None,
    }
    write_json(_run_path(run_id), record)
    return record


def read_run(run_id: str) -> dict[str, Any] | None:
    return read_json(_run_path(run_id))


def list_runs(limit: int = 100) -> list[dict[str, Any]]:
    root = runs_dir()
    if not root.exists():
        return []
    out: list[dict[str, Any]] = []
    for folder in root.iterdir():
        if not folder.is_dir():
            continue
        record = read_json(folder / "run.json")
        if record:
            out.append(record)
    out.sort(key=lambda r: r.get("created_at", 0), reverse=True)
    return out[:limit]


def update_run(run_id: str, **fields: Any) -> dict[str, Any] | None:
    with _LOCK:
        record = read_run(run_id)
        if record is None:
            return None
        record.update(fields)
        record["updated_at"] = time.time()
        write_json(_run_path(run_id), record)
        return record


def append_metric(run_id: str, metric: dict[str, Any]) -> None:
    path = _metrics_path(run_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(_dumps(metric) + "\n")
    # Update lightweight pointers without holding the full series in run.json.
    with _LOCK:
        record = read_run(run_id)
        if record is None:
            return
        record["metric_count"] = int(record.get("metric_count", 0)) + 1
        record["last_metric"] = metric
        record["updated_at"] = time.time()
        write_json(_run_path(run_id), record)


def read_metrics(run_id: str, *, offset: int = 0, limit: int = 5000) -> list[dict[str, Any]]:
    path = _metrics_path(run_id)
    if not path.exists():
        return []
    lines = path.read_text(encoding="utf-8").splitlines()
    out: list[dict[str, Any]] = []
    for line in lines[offset : offset + limit]:
        line = line.strip()
        if line:
            try:
                out.append(_loads(line))
            except Exception:  # noqa: BLE001
                continue
    return out


def checkpoint_path_for(run_id: str, *, suffix: str = "checkpoint") -> Path:
    return _run_dir(run_id) / f"{suffix}"


def delete_run(run_id: str) -> bool:
    folder = _run_dir(run_id)
    if not folder.exists():
        return False
    for child in folder.iterdir():
        if child.is_file():
            child.unlink()
    folder.rmdir()
    return True


def _dumps(obj: Any) -> str:
    import json

    return json.dumps(obj)


def _loads(text: str) -> Any:
    import json

    return json.loads(text)
