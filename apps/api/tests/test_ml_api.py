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


def test_ml_rl_train_and_rollout(client):
    job = client.post(
        "/api/ml/train",
        json={"kind": "rl", "env_id": "gridworld", "algo": "q_learning", "hyperparams": {"episodes": 120}},
    ).json()
    record = _wait_run(client, job["id"])
    assert record["status"] == "complete"
    rollout = client.post(f"/api/ml/runs/{job['id']}/infer", json={}).json()
    assert rollout["kind"] == "rl" and rollout["steps"] > 0


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


def test_chipmunk_ml_routing(client):
    reply = client.post("/api/chipmunk/chat", json={"message": "list environments"}).json()
    assert reply["routed_to"] == "test"
    assert "cartpole" in reply["reply"].lower()

    started = client.post("/api/chipmunk/chat", json={"message": "train gridworld with q-learning for 100 episodes"}).json()
    assert started["routed_to"] == "tune"
    assert "run-" in started["reply"]
