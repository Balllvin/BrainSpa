"""Generic ML platform API — train any registered environment or tabular model.

Mounted at ``/api/ml``. This is the API surface that turns the Snake-only shell
into a general "train any small AI from scratch" tool: an environment + algorithm
catalog, tabular dataset ingest, a training-job submitter, a run/experiment
registry with streamed metrics, and inference.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from packages.brainspa_ml import datasets as ds
from packages.brainspa_ml import jobs, runs, supervised
from packages.brainspa_ml.algorithms import list_algorithm_specs
from packages.brainspa_ml.environments import list_env_specs

router = APIRouter(prefix="/api/ml", tags=["ml"])


# --- Request models --------------------------------------------------------


class DatasetUploadRequest(BaseModel):
    name: str
    content: str
    format: str = "csv"


class BuiltinDatasetRequest(BaseModel):
    name: str
    rows: int = 300
    seed: int = 0


class TrainRequest(BaseModel):
    kind: str  # "rl" | "supervised"
    # RL
    env_id: str | None = None
    # Supervised
    dataset_id: str | None = None
    target: str | None = None
    features: list[str] | None = None
    # Shared
    algo: str
    hyperparams: dict[str, Any] = Field(default_factory=dict)
    label: str | None = None


class InferRequest(BaseModel):
    row: dict[str, Any] | None = None
    seed: int | None = None


# --- Catalog ---------------------------------------------------------------


@router.get("/catalog")
def catalog() -> dict[str, Any]:
    """Everything the UI needs to populate the training launcher in one call."""

    return {
        "environments": [spec.to_dict() for spec in list_env_specs()],
        "rl_algorithms": [spec.to_dict() for spec in list_algorithm_specs()],
        "supervised_algorithms": supervised.list_supervised_algorithms(),
        "builtin_datasets": [{"name": k, "description": v} for k, v in ds.BUILTIN_DATASETS.items()],
    }


@router.get("/environments")
def environments() -> list[dict[str, Any]]:
    return [spec.to_dict() for spec in list_env_specs()]


@router.get("/algorithms")
def algorithms() -> dict[str, Any]:
    return {
        "rl": [spec.to_dict() for spec in list_algorithm_specs()],
        "supervised": supervised.list_supervised_algorithms(),
    }


# --- Datasets --------------------------------------------------------------


@router.get("/datasets")
def list_ml_datasets() -> list[dict[str, Any]]:
    return ds.list_datasets()


@router.post("/datasets/upload")
def upload_dataset(body: DatasetUploadRequest) -> dict[str, Any]:
    try:
        return ds.ingest_tabular(body.name, body.content, body.format, source="upload")
    except (ValueError, json.JSONDecodeError) as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/datasets/builtin")
def add_builtin_dataset(body: BuiltinDatasetRequest) -> dict[str, Any]:
    try:
        display, content = ds.generate_builtin(body.name, n=body.rows, seed=body.seed)
        return ds.ingest_tabular(f"{display} ({body.name})", content, "jsonl", source="builtin")
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.get("/datasets/{dataset_id}")
def dataset_detail(dataset_id: str, sample: int = 12) -> dict[str, Any]:
    meta = ds.get_dataset_meta(dataset_id)
    if meta is None:
        raise HTTPException(status_code=404, detail="dataset not found")
    return {**meta, "sample_rows": ds.sample_rows(dataset_id, limit=sample)}


@router.delete("/datasets/{dataset_id}")
def remove_dataset(dataset_id: str) -> dict[str, bool]:
    return {"deleted": ds.delete_dataset(dataset_id)}


# --- Training & runs -------------------------------------------------------


@router.post("/train")
def train(body: TrainRequest) -> dict[str, Any]:
    if body.kind == "rl":
        if not body.env_id:
            raise HTTPException(status_code=400, detail="env_id is required for kind='rl'")
        try:
            result = jobs.submit_rl_job(env_id=body.env_id, algo=body.algo, hyperparams=body.hyperparams, label=body.label)
        except KeyError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error
    elif body.kind == "supervised":
        if not body.dataset_id or not body.target:
            raise HTTPException(status_code=400, detail="dataset_id and target are required for kind='supervised'")
        result = jobs.submit_supervised_job(
            dataset_id=body.dataset_id,
            target=body.target,
            algo=body.algo,
            features=body.features,
            hyperparams=body.hyperparams,
            label=body.label,
        )
    else:
        raise HTTPException(status_code=400, detail="kind must be 'rl' or 'supervised'")
    if isinstance(result, dict) and result.get("error"):
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@router.get("/runs")
def list_ml_runs(limit: int = 100) -> list[dict[str, Any]]:
    return runs.list_runs(limit=limit)


@router.get("/runs/{run_id}")
def run_detail(run_id: str, metrics: bool = True, metric_limit: int = 2000) -> dict[str, Any]:
    record = runs.read_run(run_id)
    if record is None:
        raise HTTPException(status_code=404, detail="run not found")
    if metrics:
        record = {**record, "metrics": runs.read_metrics(run_id, limit=metric_limit)}
    return record


@router.post("/runs/{run_id}/stop")
def stop_ml_run(run_id: str) -> dict[str, Any]:
    record = jobs.stop_run(run_id)
    if record is None:
        raise HTTPException(status_code=404, detail="run not found")
    return record


@router.delete("/runs/{run_id}")
def delete_ml_run(run_id: str) -> dict[str, bool]:
    return {"deleted": runs.delete_run(run_id)}


@router.post("/runs/{run_id}/infer")
def infer_ml_run(run_id: str, body: InferRequest) -> dict[str, Any]:
    result = jobs.run_inference(run_id, row=body.row, seed=body.seed)
    if result.get("error"):
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@router.get("/runs/{run_id}/stream")
def stream_ml_run(run_id: str):
    async def event_stream():
        sent = 0
        while True:
            record = runs.read_run(run_id)
            if record is None:
                yield f"data: {json.dumps({'type': 'error', 'detail': 'run not found'})}\n\n"
                break
            new_metrics = runs.read_metrics(run_id, offset=sent)
            if new_metrics:
                sent += len(new_metrics)
                yield f"data: {json.dumps({'type': 'metrics', 'metrics': new_metrics, 'run': _light(record)})}\n\n"
            else:
                yield f"data: {json.dumps({'type': 'tick', 'run': _light(record)})}\n\n"
            if record.get("status") in {"complete", "failed", "stopped"}:
                yield f"data: {json.dumps({'type': 'done', 'run': record})}\n\n"
                break
            await asyncio.sleep(0.5)

    return StreamingResponse(event_stream(), media_type="text/event-stream")


def _light(record: dict[str, Any]) -> dict[str, Any]:
    return {k: record.get(k) for k in ("id", "status", "metric_count", "last_metric", "summary", "error")}
