from apps.api.brainspa_api.policy_paths import snake_checkpoint_path
from apps.api.brainspa_api.policy_datasets import trajectories_path
from packages.brainspa_training.snake_lab import get_snake_train_lab


def test_reset_snake_policy_clears_checkpoint_and_lab(client, tmp_path, monkeypatch):
    monkeypatch.setenv("BRAIN_SPA_HOME", str(tmp_path))

    checkpoint = snake_checkpoint_path()
    checkpoint.parent.mkdir(parents=True, exist_ok=True)
    checkpoint.write_bytes(b"old")
    trajectories = trajectories_path()
    trajectories.parent.mkdir(parents=True, exist_ok=True)
    trajectories.write_text('{"episode_id":"e1"}\n', encoding="utf-8")

    lab = get_snake_train_lab()
    lab.record_apples = 9
    lab.episodes_completed = 4

    response = client.post("/api/env/snake/reset")
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert not checkpoint.exists()
    assert not trajectories.exists()
    assert get_snake_train_lab().episodes_completed == 0
    assert get_snake_train_lab().record_apples == 0


def test_lab_episodes_endpoint(client, tmp_path, monkeypatch):
    monkeypatch.setenv("BRAIN_SPA_HOME", str(tmp_path))

    get_snake_train_lab().stop()
    response = client.post("/api/env/snake/lab/episodes", json={"episodes": 500})
    assert response.status_code == 200
    assert response.json()["lab"]["episodes_target"] == 500
