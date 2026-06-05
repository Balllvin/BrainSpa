from packages.brainspa_training.snake_lab import get_snake_train_lab


def test_lab_parallel_slots_tick(client, tmp_path, monkeypatch):
    from apps.api.brainspa_api import policy_paths

    checkpoint = tmp_path / "policy.pt"
    monkeypatch.setattr(policy_paths, "snake_checkpoint_path", lambda: checkpoint)

    lab = get_snake_train_lab()
    lab.stop()
    lab.start(checkpoint_path=checkpoint, slots=4, episodes_target=5, pace="train")
    assert lab.running
    assert len(lab.slots) == 4

    for _ in range(200):
        lab.tick()
        if lab.global_episode >= 2:
            break

    snap = lab.snapshot()
    assert snap["slot_count"] == 4
    assert len(snap["slots"]) == 4
    assert all("world_state" in slot for slot in snap["slots"])
    lab.stop()


def test_lab_api_start_and_status(client):
    get_snake_train_lab().stop()
    start = client.post(
        "/api/env/snake/lab/start",
        json={"slots": 3, "episodes": 12, "pace": "train"},
    )
    assert start.status_code == 200
    body = start.json()
    assert body["ok"] is True
    assert body["lab"]["slot_count"] == 3

    status = client.get("/api/env/snake/lab")
    assert status.status_code == 200
    assert status.json()["slot_count"] == 3

    stop = client.post("/api/env/snake/lab/stop")
    assert stop.status_code == 200
    assert stop.json()["ok"] is True