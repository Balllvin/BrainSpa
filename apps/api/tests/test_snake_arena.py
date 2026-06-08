from __future__ import annotations

from packages.brainspa_environments.snake.arena import SnakeArenaSim


def test_arena_reset_two_snakes():
    arena = SnakeArenaSim(seed=1)
    state = arena.reset(seed=1)
    assert state.player.alive
    assert state.opponent.alive
    assert state.player.head != state.opponent.head


def test_arena_step_until_done():
    arena = SnakeArenaSim(seed=2)
    arena.reset(seed=2)
    for _ in range(200):
        if arena.state.done:
            break
        arena.step(0, 1)
    assert arena.state.done


def test_arena_session_api(client):
    created = client.post(
        "/api/env/snake/session",
        json={"scenario_key": "dual-arena", "mode": "interactive_arena", "seed": 3},
    )
    assert created.status_code == 200
    session_id = created.json()["session_id"]
    assert created.json()["world_state"]["mode"] == "arena"
    stepped = client.post("/api/env/snake/step", json={"session_id": session_id})
    assert stepped.status_code == 200
    client.post(f"/api/env/snake/session/{session_id}/close")


def test_archived_sessions_after_human_play(client):
    created = client.post(
        "/api/env/snake/session",
        json={"scenario_key": "human-play", "mode": "interactive_play", "seed": 4},
    )
    session_id = created.json()["session_id"]
    client.post("/api/env/snake/step", json={"session_id": session_id, "action": "up"})
    client.post(f"/api/env/snake/session/{session_id}/close")
    listed = client.get("/api/env/snake/sessions/archived")
    assert listed.status_code == 200
    ids = {item["session_id"] for item in listed.json()}
    assert session_id in ids


def test_coach_replay_returns_world_state(client):
    created = client.post(
        "/api/env/snake/session",
        json={"scenario_key": "human-play", "mode": "interactive_play", "seed": 5},
    )
    session_id = created.json()["session_id"]
    client.post("/api/env/snake/step", json={"session_id": session_id, "action": "right"})
    client.post(f"/api/env/snake/session/{session_id}/close")
    replay = client.get(f"/api/env/snake/coach/{session_id}?step=0")
    assert replay.status_code == 200
    payload = replay.json()
    assert payload["ok"] is True
    world = payload["world_state"]
    assert world is not None
    assert len(world["snake"]) >= 3
    assert "apple" in world


def test_snake_transitions_pagination(client):
    response = client.get("/api/datasets/snake/transitions?limit=5&offset=0")
    assert response.status_code == 200
    payload = response.json()
    assert "total" in payload
    assert "rows" in payload
    assert payload["limit"] == 5