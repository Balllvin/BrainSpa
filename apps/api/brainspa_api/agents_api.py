"""Operator/agent skills API — mounted at ``/api/agents``.

Exposes the skill registry that gives Chipmunk and the four resident worker
models concrete capabilities, plus a couple of query skills (algorithm
recommendation, run comparison) that the operator can call directly.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from packages.brainspa_agents.skills import list_skills, skills_by_worker
from packages.brainspa_ml import runs
from packages.brainspa_ml.algorithms import list_algorithm_specs
from packages.brainspa_ml.environments import get_env_spec

router = APIRouter(prefix="/api/agents", tags=["agents"])


class RecommendRequest(BaseModel):
    kind: str  # "rl" | "supervised"
    env_id: str | None = None
    task: str | None = None  # "classification" | "regression"


class CompareRequest(BaseModel):
    run_ids: list[str]


@router.get("/skills")
def get_skills() -> dict[str, Any]:
    return {"workers": skills_by_worker(), "skills": list_skills()}


@router.post("/recommend-algorithm")
def recommend_algorithm(body: RecommendRequest) -> dict[str, Any]:
    torch_ok = any(spec.id == "ppo" and spec.to_dict()["available"] for spec in list_algorithm_specs())
    if body.kind == "rl":
        if not body.env_id:
            raise HTTPException(status_code=400, detail="env_id is required for rl recommendations")
        try:
            spec = get_env_spec(body.env_id)
        except KeyError as error:
            raise HTTPException(status_code=404, detail=str(error)) from error
        if spec.discrete_states is not None:
            return {
                "recommended": "q_learning",
                "alternatives": ["dqn"] if torch_ok else [],
                "rationale": f"{spec.label} has a fully discrete state space ({spec.discrete_states} states), so a Q-table converges fast with no neural net.",
            }
        if not torch_ok:
            return {
                "recommended": None,
                "alternatives": [],
                "rationale": f"{spec.label} has continuous observations and needs a neural method (PPO/DQN), but PyTorch is not installed.",
            }
        return {
            "recommended": "ppo",
            "alternatives": ["dqn", "reinforce"],
            "rationale": f"{spec.label} has continuous observations; PPO is the robust default, DQN is strong off-policy, REINFORCE is the simplest baseline.",
        }
    if body.kind == "supervised":
        task = body.task or "classification"
        if task == "classification":
            return {
                "recommended": "logreg",
                "alternatives": ["mlp"] if torch_ok else [],
                "rationale": "Start with logistic regression (no dependencies, fast, interpretable). Move to an MLP for nonlinear boundaries.",
            }
        return {
            "recommended": "linreg",
            "alternatives": ["mlp"] if torch_ok else [],
            "rationale": "Start with linear regression. Use an MLP if the relationship is nonlinear.",
        }
    raise HTTPException(status_code=400, detail="kind must be 'rl' or 'supervised'")


@router.post("/compare-runs")
def compare_runs(body: CompareRequest) -> dict[str, Any]:
    rows: list[dict[str, Any]] = []
    for run_id in body.run_ids:
        record = runs.read_run(run_id)
        if record is None:
            continue
        rows.append(
            {
                "id": run_id,
                "label": record.get("label"),
                "kind": record.get("kind"),
                "algo": record.get("algo"),
                "status": record.get("status"),
                "score": _score_of(record),
                "metric": _metric_name(record),
            }
        )
    rows.sort(key=_score_sort_key, reverse=True)
    return {"runs": rows, "winner": rows[0]["id"] if rows else None}


def _score_sort_key(row: dict[str, Any]) -> tuple[bool, float]:
    score = row["score"]
    return score is not None, score if score is not None else float("-inf")


def _score_of(record: dict[str, Any]) -> float | None:
    summary = record.get("summary") or {}
    if record.get("kind") == "rl":
        evaluation = summary.get("evaluation") or {}
        if "mean_return" in evaluation:
            return float(evaluation["mean_return"])
        best_mean = summary.get("best_mean_return")
        if best_mean is not None:
            return float(best_mean)
        return None
    metrics = summary.get("metrics") or {}
    for key in ("accuracy", "r2", "macro_f1"):
        if key in metrics:
            return float(metrics[key])
    return None


def _metric_name(record: dict[str, Any]) -> str:
    summary = record.get("summary") or {}
    if record.get("kind") == "rl":
        return "mean_return"
    metrics = summary.get("metrics") or {}
    for key in ("accuracy", "r2", "macro_f1"):
        if key in metrics:
            return key
    return "—"
