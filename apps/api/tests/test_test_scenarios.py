from __future__ import annotations


def test_snake_scenarios_by_slug(client):
    response = client.get("/api/harness/scenarios/snake")
    assert response.status_code == 200
    keys = {item["key"] for item in response.json()}
    assert "autonomous-train" in keys
    assert "human-play" in keys


def test_unknown_model_returns_404(client):
    response = client.get("/api/harness/scenarios/not-a-model")
    assert response.status_code == 404


def test_retired_slug_returns_404(client):
    response = client.get("/api/harness/scenarios/retired-chat")
    assert response.status_code == 404
