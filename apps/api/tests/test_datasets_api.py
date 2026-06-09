from __future__ import annotations

import json

from apps.api.brainspa_api.policy_datasets import trajectories_path, transitions_path


def test_default_text_dataset_generation_is_not_shipped(client):
    response = client.post("/api/datasets/generate", json={"example_count": 24})

    assert response.status_code == 400
    assert "no default text dataset" in response.json()["detail"].lower()


def test_snake_dataset_generation_routes_to_environment(client):
    response = client.post("/api/datasets/snake_rollout/generate", json={"example_count": 24})

    assert response.status_code == 400
    assert "autonomous train" in response.json()["detail"].lower()


def test_snake_policy_summary_starts_empty(client):
    response = client.get("/api/datasets/snake/policy-summary")

    assert response.status_code == 200
    body = response.json()
    assert body["dataset_key"] == "snake_rollout"
    assert body["trajectory_count"] == 0
    assert body["transition_count"] == 0


def test_snake_transitions_read_local_rollout_artifact(client):
    path = trajectories_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(
            {
                "episode_id": "episode-1",
                "steps": [
                    {
                        "state": {"head": [4, 4], "apple": [5, 4], "direction": "right"},
                        "action": "straight",
                        "reward": 1.25,
                        "done": False,
                    }
                ],
            }
        )
        + "\n",
        encoding="utf-8",
    )
    transitions_path().write_text(
        json.dumps(
            {
                "episode_id": "episode-1",
                "step": 0,
                "action": "straight",
                "reward": 1.25,
                "done": False,
            }
        )
        + "\n",
        encoding="utf-8",
    )

    response = client.get("/api/datasets/snake/transitions")

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["rows"][0]["episode_id"] == "episode-1"
    assert body["rows"][0]["action"] == "straight"
