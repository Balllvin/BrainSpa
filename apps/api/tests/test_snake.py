from __future__ import annotations

from packages.brainspa_environments.snake import RewardDecomposer, SnakeSim, encode_state



def test_snake_reset_and_step():
    sim = SnakeSim(seed=1)
    state = sim.reset(seed=1)
    assert state.length == 3
    assert not state.done
    result = sim.step("right")
    assert result.state.steps == 1


def test_snake_wall_death():
    sim = SnakeSim(seed=99)
    sim.reset(seed=99)
    for _ in range(20):
        if sim.state.done:
            break
        sim.step("left")
    assert sim.state.done
    assert sim.state.outcome in {"died_wall", "died_self", "max_steps", "full_board"}


def test_reward_decomposer_logs_components():
    sim = SnakeSim(seed=2)
    state = sim.reset(seed=2)
    decomposer = RewardDecomposer()
    decomposer.reset(state)
    step = sim.step(0)
    breakdown = decomposer.step(state, step.state, ate_apple=step.ate_apple)
    payload = breakdown.to_dict()
    assert "total" in payload
    assert "survival" in payload


def test_state_vector_dimension():
    sim = SnakeSim(seed=3)
    state = sim.reset(seed=3)
    vector = encode_state(sim, state, env_profile="solo")
    assert len(vector) == 11


def test_coords_state_dim():
    sim = SnakeSim(seed=3)
    state = sim.reset(seed=3)
    vector = encode_state(sim, state, env_profile="coords")
    assert len(vector) == 33


def test_legacy_coords_profile_alias():
    sim = SnakeSim(seed=3)
    state = sim.reset(seed=3)
    assert encode_state(sim, state, env_profile="coords_v1") == encode_state(sim, state, env_profile="coords")


def test_sparse_rewards():
    sim = SnakeSim(seed=4)
    state = sim.reset(seed=4)
    decomposer = RewardDecomposer(reward_mode="sparse")
    decomposer.reset(state)
    step = sim.step(0)
    breakdown = decomposer.step(state, step.state, ate_apple=step.ate_apple)
    assert breakdown.survival == 0.0
    assert breakdown.distance_to_apple_delta == 0.0
    if step.ate_apple:
        assert breakdown.apple == 1.0
        assert breakdown.total == 1.0


def test_tail_move_into_tail_allowed():
    """Moving into the vacated tail cell should not count as self-collision."""
    sim = SnakeSim(seed=1)
    sim.reset(seed=1)
    sim._state = sim._state.__class__(
        grid_size=10,
        snake=[(5, 5), (5, 6), (5, 7)],
        direction="up",
        apple=(0, 0),
        score=0,
        steps=0,
        done=False,
        outcome="in_progress",
    )
    result = sim.step("up")
    assert not result.state.done
    assert result.state.outcome == "in_progress"


def test_snake_scenarios_listed(client):
    response = client.get("/api/harness/scenarios/snake_policy")
    assert response.status_code == 200
    keys = {item["key"] for item in response.json()}
    assert "autonomous-train" in keys
    assert "autonomous-watch" in keys


def test_snake_session_lifecycle(client):
    created = client.post(
        "/api/env/snake/session",
        json={"scenario_key": "autonomous-watch", "mode": "interactive_watch", "seed": 1},
    )
    assert created.status_code == 200
    session_id = created.json()["session_id"]
    stepped = client.post("/api/env/snake/step", json={"session_id": session_id})
    assert stepped.status_code == 200
    closed = client.post(f"/api/env/snake/session/{session_id}/close")
    assert closed.status_code == 200


def test_policy_train_job_endpoint(client):
    response = client.get("/api/policy/snake/train-job")
    assert response.status_code == 200
    assert "state" in response.json()