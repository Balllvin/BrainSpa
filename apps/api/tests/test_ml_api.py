from __future__ import annotations

import time


def _wait_run(client, run_id: str, timeout: float = 30.0) -> dict:
    deadline = time.time() + timeout
    while time.time() < deadline:
        record = client.get(f"/api/ml/runs/{run_id}").json()
        if record.get("status") in {"complete", "failed", "stopped"}:
            return record
        time.sleep(0.1)
    raise AssertionError(f"run {run_id} did not finish")


def test_ml_catalog(client):
    catalog = client.get("/api/ml/catalog").json()
    env_ids = {e["id"] for e in catalog["environments"]}
    assert {"cartpole", "gridworld", "snake"} <= env_ids
    rl_ids = {a["id"] for a in catalog["rl_algorithms"]}
    assert {"ppo", "dqn", "q_learning", "reinforce"} <= rl_ids
    assert {a["id"] for a in catalog["supervised_algorithms"]} == {"logreg", "linreg", "mlp"}


def test_ml_builtin_dataset_and_train(client):
    meta = client.post("/api/ml/datasets/builtin", json={"name": "blobs", "rows": 150}).json()
    dataset_id = meta["id"]
    assert meta["row_count"] == 150

    listing = client.get("/api/ml/datasets").json()
    assert any(d["id"] == dataset_id for d in listing)

    job = client.post(
        "/api/ml/train",
        json={"kind": "supervised", "dataset_id": dataset_id, "target": "label", "algo": "logreg"},
    ).json()
    record = _wait_run(client, job["id"])
    assert record["status"] == "complete"
    assert record["summary"]["metrics"]["accuracy"] > 0.7

    pred = client.post(f"/api/ml/runs/{job['id']}/infer", json={"row": {"x1": -2.0, "x2": -2.0}}).json()
    assert "prediction" in pred


def test_ml_train_rejects_target_feature_leakage(client):
    meta = client.post("/api/ml/datasets/builtin", json={"name": "blobs", "rows": 80}).json()
    response = client.post(
        "/api/ml/train",
        json={"kind": "supervised", "dataset_id": meta["id"], "target": "label", "features": ["x1", "label"], "algo": "logreg"},
    )
    assert response.status_code == 400
    assert "cannot be used as a feature" in response.json()["detail"]


def test_ml_rl_train_and_rollout(client):
    job = client.post(
        "/api/ml/train",
        json={"kind": "rl", "env_id": "gridworld", "algo": "q_learning", "hyperparams": {"episodes": 120}},
    ).json()
    record = _wait_run(client, job["id"])
    assert record["status"] == "complete"
    rollout = client.post(f"/api/ml/runs/{job['id']}/infer", json={}).json()
    assert rollout["kind"] == "rl" and rollout["steps"] > 0


def test_ml_run_stop_is_noop_when_already_terminal(client):
    job = client.post(
        "/api/ml/train",
        json={"kind": "rl", "env_id": "gridworld", "algo": "q_learning", "hyperparams": {"episodes": 0}},
    ).json()
    record = _wait_run(client, job["id"])
    assert record["status"] == "complete"

    stopped = client.post(f"/api/ml/runs/{job['id']}/stop").json()
    assert stopped["status"] == "complete"


def test_ml_run_stream_honors_metric_offset(client):
    from packages.brainspa_ml import runs

    record = runs.create_run(kind="rl", algo="q_learning", label="offset", target={"env_id": "gridworld"}, hyperparams={})
    runs.append_metric(record["id"], {"episode": 1, "mean_return": 0.1})
    runs.append_metric(record["id"], {"episode": 2, "mean_return": 0.2})
    runs.update_run(record["id"], status="complete", summary={"best_mean_return": 0.2})

    with client.stream("GET", f"/api/ml/runs/{record['id']}/stream?offset=1") as response:
        body = "".join(response.iter_text())

    assert '"episode": 1' not in body
    assert '"episode": 2' in body


def test_ml_run_delete_rejects_active_records(client):
    from packages.brainspa_ml import runs

    record = runs.create_run(kind="rl", algo="q_learning", label="queued", target={"env_id": "gridworld"}, hyperparams={})
    response = client.delete(f"/api/ml/runs/{record['id']}")
    assert response.status_code == 409
    assert "Stop the run" in response.json()["detail"]


def test_ml_upload_csv(client):
    csv = "x1,x2,label\n-2,-2,a\n2,-2,b\n0,2,c\n-2,-1,a\n2,-1,b\n0,2.5,c\n"
    meta = client.post("/api/ml/datasets/upload", json={"name": "tiny", "content": csv, "format": "csv"}).json()
    assert meta["row_count"] == 6
    cols = {c["name"] for c in meta["columns"]}
    assert cols == {"x1", "x2", "label"}


def test_ml_train_rejects_bad_kind(client):
    response = client.post("/api/ml/train", json={"kind": "bogus", "algo": "ppo"})
    assert response.status_code == 400


def test_agent_skills(client):
    payload = client.get("/api/agents/skills").json()
    worker_keys = {w["key"] for w in payload["workers"]}
    assert {"chipmunk", "source_model", "data_model", "training_model", "harness_model"} <= worker_keys
    assert len(payload["skills"]) >= 10


def test_agent_recommend(client):
    rec = client.post("/api/agents/recommend-algorithm", json={"kind": "rl", "env_id": "gridworld"}).json()
    assert rec["recommended"] == "q_learning"
    rec2 = client.post("/api/agents/recommend-algorithm", json={"kind": "supervised", "task": "regression"}).json()
    assert rec2["recommended"] == "linreg"


def test_agent_compare_preserves_zero_scores(client):
    from packages.brainspa_ml import runs

    zero = runs.create_run(kind="supervised", algo="logreg", label="zero", target={}, hyperparams={})
    negative = runs.create_run(kind="supervised", algo="linreg", label="negative", target={}, hyperparams={})
    missing = runs.create_run(kind="supervised", algo="logreg", label="missing", target={}, hyperparams={})
    runs.update_run(zero["id"], status="complete", summary={"metrics": {"accuracy": 0.0}})
    runs.update_run(negative["id"], status="complete", summary={"metrics": {"r2": -0.5}})
    runs.update_run(missing["id"], status="complete", summary={"metrics": {}})

    payload = client.post("/api/agents/compare-runs", json={"run_ids": [negative["id"], missing["id"], zero["id"]]}).json()
    assert payload["winner"] == zero["id"]
    assert [row["id"] for row in payload["runs"]] == [zero["id"], negative["id"], missing["id"]]


def test_agent_compare_handles_null_rl_best_score(client):
    from packages.brainspa_ml import runs

    empty = runs.create_run(kind="rl", algo="q_learning", label="empty", target={"env_id": "gridworld"}, hyperparams={})
    scored = runs.create_run(kind="rl", algo="q_learning", label="scored", target={"env_id": "gridworld"}, hyperparams={})
    runs.update_run(empty["id"], status="complete", summary={"best_mean_return": None})
    runs.update_run(scored["id"], status="complete", summary={"best_mean_return": 0.0})

    payload = client.post("/api/agents/compare-runs", json={"run_ids": [empty["id"], scored["id"]]}).json()
    assert payload["winner"] == scored["id"]


def test_agent_recommend_continuous_env_without_torch(client, monkeypatch):
    from packages.brainspa_ml.algorithms import base as algorithm_base

    monkeypatch.setattr(algorithm_base, "_torch_available", lambda: False)
    rec = client.post("/api/agents/recommend-algorithm", json={"kind": "rl", "env_id": "cartpole"}).json()
    assert rec["recommended"] is None
    assert "PyTorch is not installed" in rec["rationale"]


def test_chipmunk_ml_routing(client):
    reply = client.post("/api/chipmunk/chat", json={"message": "list environments"}).json()
    assert reply["routed_to"] == "test"
    assert "cartpole" in reply["reply"].lower()

    started = client.post("/api/chipmunk/chat", json={"message": "train gridworld with q-learning for 100 episodes"}).json()
    assert started["routed_to"] == "tune"
    assert "run-" in started["reply"]


def test_chipmunk_blocks_continuous_training_without_torch(client, monkeypatch):
    from packages.brainspa_ml.algorithms import base as algorithm_base

    monkeypatch.setattr(algorithm_base, "_torch_available", lambda: False)
    rec = client.post("/api/chipmunk/chat", json={"message": "which algorithm for cartpole"}).json()
    assert rec["routed_to"] == "tune"
    assert "PyTorch is not installed" in rec["reply"]

    started = client.post("/api/chipmunk/chat", json={"message": "train cartpole"}).json()
    assert started["routed_to"] == "tune"
    assert "Could not start training" in started["reply"]
