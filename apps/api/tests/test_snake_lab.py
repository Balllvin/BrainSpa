from packages.brainspa_training.snake_lab import get_snake_train_lab, lab_tick_config


def test_lab_speed_1x_matches_human_pace():
    cfg = lab_tick_config(1.0)
    assert cfg["interval_sec"] == 0.125
    assert cfg["steps_per_slot"] == 1


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
        if lab.episodes_completed >= 2:
            break

    snap = lab.snapshot()
    assert snap["slot_count"] == 4
    assert len(snap["slots"]) == 4
    assert all("world_state" in slot for slot in snap["slots"])
    assert snap["record_moves"] >= 0
    assert "record_apples" in snap
    lab.stop()


def test_lab_snapshot_reflects_live_mid_episode(tmp_path, monkeypatch):
    from apps.api.brainspa_api import policy_paths

    checkpoint = tmp_path / "policy.pt"
    monkeypatch.setattr(policy_paths, "snake_checkpoint_path", lambda: checkpoint)

    lab = get_snake_train_lab()
    lab.stop()
    lab.start(checkpoint_path=checkpoint, slots=2, episodes_target=20, pace="train")
    lab.slots[0].sim.state.score = 6
    lab.slots[0].sim.state.steps = 18

    snap = lab.snapshot()
    assert snap["live_best_apples"] == 6
    assert snap["record_apples"] >= 6
    assert snap["record_moves"] >= 18
    assert snap["live_best_length"] >= 3
    lab.stop()


def test_lab_drains_in_flight_before_stop(tmp_path, monkeypatch):
    from apps.api.brainspa_api import policy_paths

    checkpoint = tmp_path / "policy.pt"
    monkeypatch.setattr(policy_paths, "snake_checkpoint_path", lambda: checkpoint)

    lab = get_snake_train_lab()
    lab.stop()
    lab.start(checkpoint_path=checkpoint, slots=3, episodes_target=10, pace="train")
    assert lab.episodes_started == 3

    lab.episodes_completed = 9
    lab.episodes_started = 10
    for slot in lab.slots[:2]:
        slot.sim.state.done = True
        slot.last_outcome = "died_wall"
        slot.episode_logged = True
    lab.slots[2].sim.state.done = False
    lab.slots[2].last_outcome = None
    lab.slots[2].episode_logged = False

    lab._try_complete_lab()
    assert lab.running

    lab.slots[2].sim.state.done = True
    lab._finish_slot_episode(lab.slots[2])
    assert lab.episodes_completed == 10
    assert not lab.running
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


def test_lab_speed_endpoint(client):
    get_snake_train_lab().stop()
    client.post(
        "/api/env/snake/lab/start",
        json={"slots": 2, "episodes": 10, "speed_multiplier": 1},
    )
    faster = client.post("/api/env/snake/lab/speed", json={"speed_multiplier": 4})
    assert faster.status_code == 200
    assert faster.json()["lab"]["speed_multiplier"] == 4
    client.post("/api/env/snake/lab/stop")