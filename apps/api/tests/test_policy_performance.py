import json

from apps.api.brainspa_api.policy_performance import (
    read_policy_performance,
    update_policy_performance_from_episode,
)


def _isolate_performance_paths(tmp_path, monkeypatch):
    perf_path = tmp_path / "snake_policy_performance.json"
    traj_path = tmp_path / "trajectories.jsonl"
    monkeypatch.setattr(
        "apps.api.brainspa_api.policy_performance.snake_performance_path",
        lambda: perf_path,
    )
    monkeypatch.setattr(
        "apps.api.brainspa_api.policy_performance.trajectories_path",
        lambda dataset_key="snake_rollout": traj_path,
    )
    return perf_path, traj_path


def test_update_policy_performance_from_episode(tmp_path, monkeypatch):
    _isolate_performance_paths(tmp_path, monkeypatch)

    update_policy_performance_from_episode(
        {
            "scenario_key": "simulation-lab",
            "apples_eaten": 6,
            "steps": 42,
            "max_length": 9,
            "coverage": 0.12,
            "outcome": "died_wall",
        }
    )
    data = read_policy_performance()
    assert data["records"]["apples"] == 6
    assert data["records"]["moves"] == 42
    assert data["totals"]["episodes"] == 1
    assert data["by_scenario"]["simulation-lab"]["best_apples"] == 6

    update_policy_performance_from_episode(
        {
            "scenario_key": "autonomous-watch",
            "score": 3,
            "steps": 20,
            "length": 6,
            "coverage": 0.08,
            "outcome": "died_self",
        }
    )
    data = read_policy_performance()
    assert data["records"]["apples"] == 6
    assert data["totals"]["episodes"] == 2
    assert data["by_scenario"]["autonomous-watch"]["episodes"] == 1


def test_career_record_tracks_best_apples_game(tmp_path, monkeypatch):
    _isolate_performance_paths(tmp_path, monkeypatch)
    update_policy_performance_from_episode(
        {
            "scenario_key": "simulation-lab",
            "apples_eaten": 10,
            "steps": 50,
            "max_length": 13,
            "coverage": 0.1,
            "outcome": "died_wall",
        }
    )
    update_policy_performance_from_episode(
        {
            "scenario_key": "simulation-lab",
            "apples_eaten": 5,
            "steps": 200,
            "max_length": 8,
            "coverage": 0.06,
            "outcome": "died_self",
        }
    )
    data = read_policy_performance()
    assert data["records"]["apples"] == 10
    assert data["records"]["moves"] == 50
    assert data["records"]["length"] == 13


def test_merge_career_with_live():
    from apps.api.brainspa_api.policy_performance import merge_career_with_live

    merged = merge_career_with_live(
        career={"apples": 19, "moves": 175, "length": 22, "coverage_pct": 0},
        live_apples=5,
        live_moves=40,
        live_length=8,
    )
    assert merged == {"apples": 19, "moves": 175, "length": 22}

    beating = merge_career_with_live(
        career={"apples": 19, "moves": 175, "length": 22, "coverage_pct": 0},
        live_apples=21,
        live_moves=90,
        live_length=24,
    )
    assert beating == {"apples": 21, "moves": 90, "length": 24}


def test_rebuild_from_trajectories(tmp_path, monkeypatch):
    _, traj_path = _isolate_performance_paths(tmp_path, monkeypatch)

    traj_path.parent.mkdir(parents=True, exist_ok=True)
    traj_path.write_text(
        "\n".join(
            [
                json.dumps(
                    {
                        "scenario_key": "simulation-lab",
                        "apples_eaten": 2,
                        "steps": 10,
                        "max_length": 5,
                        "coverage": 0.05,
                        "outcome": "died_wall",
                    }
                ),
                json.dumps(
                    {
                        "scenario_key": "human-play",
                        "apples_eaten": 4,
                        "steps": 20,
                        "max_length": 7,
                        "coverage": 0.08,
                        "outcome": "died_self",
                    }
                ),
            ]
        )
        + "\n",
        encoding="utf-8",
    )

    data = read_policy_performance()
    assert data["totals"]["episodes"] == 2
    assert data["records"]["apples"] == 4
    assert data["outcomes"]["died_wall"] == 1
    assert data["outcomes"]["died_self"] == 1
    assert len(data["recent_episodes"]) == 2
    assert traj_path.exists()


def test_load_lab_records(tmp_path, monkeypatch):
    from apps.api.brainspa_api.policy_performance import load_lab_records

    _isolate_performance_paths(tmp_path, monkeypatch)
    update_policy_performance_from_episode(
        {
            "scenario_key": "human-play",
            "apples_eaten": 4,
            "steps": 30,
            "max_length": 7,
            "coverage": 0.1,
            "outcome": "died_wall",
        }
    )
    loaded = load_lab_records()
    assert loaded["record_apples"] == 4
