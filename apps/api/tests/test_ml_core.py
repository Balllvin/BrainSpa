from __future__ import annotations

import time
from pathlib import Path

import pytest


@pytest.fixture(autouse=True)
def ml_home(monkeypatch, tmp_path):
    monkeypatch.setenv("BRAIN_SPA_HOME", str(tmp_path))
    yield tmp_path
    from packages.brainspa_ml import jobs

    jobs.wait_for_all(timeout=20.0)


def test_environments_registered():
    from packages.brainspa_ml.environments import list_env_specs, make_env

    specs = {spec.id: spec for spec in list_env_specs()}
    assert {"cartpole", "gridworld", "snake"} <= set(specs)
    assert specs["cartpole"].obs_dim == 4 and specs["cartpole"].num_actions == 2
    assert specs["gridworld"].discrete_states is not None

    env = make_env("cartpole")
    obs = env.reset(seed=0)
    assert len(obs) == 4
    obs2, reward, terminated, truncated, info = env.step(1)
    assert len(obs2) == 4 and reward == 1.0


def test_algorithm_registry():
    from packages.brainspa_ml.algorithms import list_algorithm_specs

    ids = {spec.id for spec in list_algorithm_specs()}
    assert {"q_learning", "dqn", "ppo", "reinforce"} <= ids


def test_q_learning_learns_gridworld(tmp_path):
    from packages.brainspa_ml.algorithms import train_algorithm
    from packages.brainspa_ml.environments import get_env_spec, make_env

    result = train_algorithm(
        "q_learning",
        lambda: make_env("gridworld"),
        hyperparams={"episodes": 250},
        checkpoint_path=tmp_path / "ql.json",
        env_spec=get_env_spec("gridworld"),
    )
    # GridWorld optimal return is ~0.93; a learned table should clear 0.5.
    assert result["evaluation"]["mean_return"] > 0.5
    assert (tmp_path / "ql.json").exists()


def test_supervised_classification_blobs(tmp_path):
    from packages.brainspa_ml import datasets as ds
    from packages.brainspa_ml import supervised

    _, content = ds.generate_builtin("blobs", n=200, seed=1)
    meta = ds.ingest_tabular("blobs", content, "jsonl")
    out = supervised.train_supervised(meta["id"], target="label", algo="logreg", checkpoint_path=tmp_path / "logreg.json")
    assert out["task"] == "classification"
    assert out["metrics"]["accuracy"] > 0.8
    pred = supervised.predict_supervised(tmp_path / "logreg.json", {"x1": -2.0, "x2": -2.0})
    assert "prediction" in pred and "probabilities" in pred


def test_supervised_regression_linear(tmp_path):
    from packages.brainspa_ml import datasets as ds
    from packages.brainspa_ml import supervised

    _, content = ds.generate_builtin("linear", n=200, seed=1)
    meta = ds.ingest_tabular("linear", content, "jsonl")
    out = supervised.train_supervised(meta["id"], target="target", algo="linreg", checkpoint_path=tmp_path / "linreg.json")
    assert out["task"] == "regression"
    assert out["metrics"]["r2"] > 0.7


def test_dataset_profile_detects_dtypes():
    from packages.brainspa_ml import datasets as ds

    rows = [{"a": "1", "b": "cat"}, {"a": "2", "b": "dog"}, {"a": "3", "b": "cat"}]
    profile = {c["name"]: c for c in ds.profile_columns(rows)}
    assert profile["a"]["dtype"] == "numeric"
    assert profile["b"]["dtype"] == "categorical"
    assert profile["b"]["unique"] == 2


def test_runs_registry_roundtrip():
    from packages.brainspa_ml import runs

    record = runs.create_run(kind="rl", algo="ppo", label="t", target={"env_id": "cartpole"}, hyperparams={})
    rid = record["id"]
    runs.append_metric(rid, {"episode": 1, "mean_return": 1.5})
    fetched = runs.read_run(rid)
    assert fetched["metric_count"] == 1
    metrics = runs.read_metrics(rid)
    assert metrics[0]["mean_return"] == 1.5
    assert any(r["id"] == rid for r in runs.list_runs())


def test_jobs_supervised_flow(tmp_path):
    from packages.brainspa_ml import datasets as ds
    from packages.brainspa_ml import jobs, runs

    _, content = ds.generate_builtin("blobs", n=120, seed=2)
    meta = ds.ingest_tabular("blobs-jobs", content, "jsonl")
    job = jobs.submit_supervised_job(dataset_id=meta["id"], target="label", algo="logreg")
    rid = job["id"]
    _wait_for(rid, runs)
    record = runs.read_run(rid)
    assert record["status"] == "complete"
    assert record["metric_count"] > 0
    inference = jobs.run_inference(rid, row={"x1": -2.0, "x2": -2.0})
    assert inference["kind"] == "supervised" and "prediction" in inference


def test_jobs_rl_flow_and_inference(tmp_path):
    from packages.brainspa_ml import jobs, runs

    job = jobs.submit_rl_job(env_id="gridworld", algo="q_learning", hyperparams={"episodes": 120})
    rid = job["id"]
    _wait_for(rid, runs)
    record = runs.read_run(rid)
    assert record["status"] == "complete"
    inference = jobs.run_inference(rid)
    assert inference["kind"] == "rl" and inference["steps"] > 0


def _wait_for(run_id: str, runs, timeout: float = 30.0) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        record = runs.read_run(run_id)
        if record and record["status"] in {"complete", "failed", "stopped"}:
            return
        time.sleep(0.1)
    raise AssertionError(f"run {run_id} did not finish in {timeout}s")
