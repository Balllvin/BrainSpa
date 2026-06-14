"""Threaded training-job runner.

Submitting a job creates a run, starts a daemon thread, and streams metrics
into the run registry. RL and supervised jobs share the same lifecycle, stop
flag, and inference entry point, mirroring the existing Snake training threads.
"""

from __future__ import annotations

import threading
from pathlib import Path
from typing import Any

from . import runs
from .environments import get_env_spec, make_env
from .paths import ensure_ml_dirs

_THREADS: dict[str, threading.Thread] = {}
_STOP_FLAGS: dict[str, bool] = {}
_LOCK = threading.Lock()
_TERMINAL_STATUSES = {"complete", "failed", "stopped"}


def submit_rl_job(*, env_id: str, algo: str, hyperparams: dict[str, Any] | None = None, label: str | None = None) -> dict[str, Any]:
    from .algorithms import get_algorithm, train_algorithm

    ensure_ml_dirs()
    env_spec = get_env_spec(env_id)  # validates env exists
    algo_spec = get_algorithm(algo)  # validates algo exists
    if algo_spec.needs_torch and not _torch_available():
        return {"error": f"Algorithm '{algo}' needs PyTorch, which is not installed."}
    if "discrete-state" in algo_spec.tags and env_spec.discrete_states is None:
        return {"error": f"Algorithm '{algo}' requires a discrete-state environment."}

    merged = {**algo_spec.default_hyperparams, **(hyperparams or {})}
    record = runs.create_run(
        kind="rl",
        algo=algo,
        label=label or f"{algo_spec.label} on {env_spec.label}",
        target={"env_id": env_id, "env_label": env_spec.label},
        hyperparams=merged,
    )
    run_id = record["id"]
    checkpoint = runs.checkpoint_path_for(run_id, suffix="policy")

    def work() -> None:
        runs.update_run(run_id, status="running")

        def on_metric(metric: dict[str, Any]) -> None:
            runs.append_metric(run_id, metric)

        def should_stop() -> bool:
            return _STOP_FLAGS.get(run_id, False)

        try:
            summary = train_algorithm(
                algo,
                lambda: make_env(env_id),
                hyperparams=merged,
                on_metric=on_metric,
                should_stop=should_stop,
                checkpoint_path=checkpoint,
                env_spec=env_spec,
            )
            status = "stopped" if _STOP_FLAGS.get(run_id) else "complete"
            runs.update_run(run_id, status=status, summary=summary, checkpoint_path=str(checkpoint))
        except Exception as error:  # noqa: BLE001
            runs.update_run(run_id, status="failed", error=str(error))

    _start(run_id, work)
    return runs.read_run(run_id) or record


def submit_supervised_job(
    *,
    dataset_id: str,
    target: str,
    algo: str = "logreg",
    features: list[str] | None = None,
    hyperparams: dict[str, Any] | None = None,
    label: str | None = None,
) -> dict[str, Any]:
    from . import datasets as ds
    from . import supervised

    ensure_ml_dirs()
    meta = ds.get_dataset_meta(dataset_id)
    if meta is None:
        return {"error": f"Dataset '{dataset_id}' not found."}
    spec = supervised.SUPERVISED_ALGORITHMS.get(algo)
    if spec is None:
        return {"error": f"Unknown algorithm '{algo}'."}
    if spec.needs_torch and not _torch_available():
        return {"error": f"Algorithm '{algo}' needs PyTorch, which is not installed."}
    try:
        supervised.validate_training_request(dataset_id, target=target, features=features, algo=algo)
    except ValueError as error:
        return {"error": str(error)}

    record = runs.create_run(
        kind="supervised",
        algo=algo,
        label=label or f"{spec.label} on {meta.get('name', dataset_id)}",
        target={"dataset_id": dataset_id, "dataset_name": meta.get("name"), "target_column": target},
        hyperparams={**spec.default_hyperparams, **(hyperparams or {})},
    )
    run_id = record["id"]
    checkpoint = runs.checkpoint_path_for(run_id, suffix="model.json")

    def work() -> None:
        runs.update_run(run_id, status="running")

        def on_metric(metric: dict[str, Any]) -> None:
            runs.append_metric(run_id, metric)

        def should_stop() -> bool:
            return _STOP_FLAGS.get(run_id, False)

        try:
            summary = supervised.train_supervised(
                dataset_id,
                target=target,
                features=features,
                algo=algo,
                hyperparams=hyperparams,
                on_metric=on_metric,
                should_stop=should_stop,
                checkpoint_path=checkpoint,
            )
            status = "stopped" if _STOP_FLAGS.get(run_id) else "complete"
            runs.update_run(run_id, status=status, summary=summary, checkpoint_path=str(checkpoint))
        except Exception as error:  # noqa: BLE001
            runs.update_run(run_id, status="failed", error=str(error))

    _start(run_id, work)
    return runs.read_run(run_id) or record


def stop_run(run_id: str) -> dict[str, Any] | None:
    record = runs.read_run(run_id)
    if record is None:
        return None
    if record.get("status") in _TERMINAL_STATUSES:
        return record

    _STOP_FLAGS[run_id] = True
    thread = _THREADS.get(run_id)
    if thread is None or not thread.is_alive():
        return runs.update_run(run_id, status="stopped")
    return runs.update_run(run_id, status="stopping")


def delete_run(run_id: str) -> dict[str, Any] | None:
    record = runs.read_run(run_id)
    if record is None:
        return None
    if record.get("status") not in _TERMINAL_STATUSES:
        return {"deleted": False, "error": "Stop the run before removing it."}
    with _LOCK:
        _STOP_FLAGS.pop(run_id, None)
        _THREADS.pop(run_id, None)
    return {"deleted": runs.delete_run(run_id)}


def wait_for_all(timeout: float = 15.0) -> None:
    """Join all active job threads.

    Job threads resolve the runtime home lazily on each write, so callers that
    change ``BRAIN_SPA_HOME`` (notably the test suite) must drain in-flight jobs
    first — otherwise a still-running thread would write into the new home. In
    normal app use the home is fixed, so this is a no-op safety valve.
    """

    import time as _time

    deadline = _time.time() + timeout
    for thread in list(_THREADS.values()):
        remaining = max(0.0, deadline - _time.time())
        thread.join(timeout=remaining)


def run_inference(run_id: str, *, row: dict[str, Any] | None = None, seed: int | None = None) -> dict[str, Any]:
    record = runs.read_run(run_id)
    if record is None:
        return {"error": "run not found"}
    checkpoint = record.get("checkpoint_path")
    if not checkpoint:
        return {"error": "run has no checkpoint yet"}
    checkpoint_path = Path(checkpoint)
    if record["kind"] == "rl":
        from .algorithms import load_policy, rollout_episode

        env_id = record["target"]["env_id"]
        env_spec = get_env_spec(env_id)
        policy = load_policy(record["algo"], checkpoint_path, env_spec=env_spec)
        env = make_env(env_id)
        out = rollout_episode(env, policy, seed=seed, max_steps=env_spec.max_episode_steps, capture_frames=True)
        return {"kind": "rl", "env_id": env_id, "total_reward": out["total_reward"], "steps": out["steps"], "frames": out.get("frames", [])}

    from . import supervised

    if row is None:
        return {"error": "supervised inference needs a 'row' of feature values"}
    prediction = supervised.predict_supervised(checkpoint_path, row)
    return {"kind": "supervised", **prediction}


def _start(run_id: str, work: Any) -> None:
    with _LOCK:
        _STOP_FLAGS[run_id] = False
        thread = threading.Thread(target=work, daemon=True)
        _THREADS[run_id] = thread
        thread.start()


def _torch_available() -> bool:
    try:
        import torch  # noqa: F401

        return True
    except Exception:  # noqa: BLE001
        return False
