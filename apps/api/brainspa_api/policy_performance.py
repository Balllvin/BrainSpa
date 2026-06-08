from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .policy_datasets import trajectories_path
from .policy_paths import snake_acceptance_path


def snake_performance_path() -> Path:
    from .config import runtime_root

    return runtime_root() / "artifacts" / "evals" / "snake_policy_performance.json"


def _empty_performance() -> dict[str, Any]:
    return {
        "model_key": "snake_policy",
        "updated_at": None,
        "records": {
            "apples": 0,
            "moves": 0,
            "length": 0,
            "coverage_pct": 0,
        },
        "totals": {
            "episodes": 0,
            "full_boards": 0,
        },
        "outcomes": {
            "died_wall": 0,
            "died_self": 0,
            "max_steps": 0,
            "full_board": 0,
            "other": 0,
        },
        "recent_50": {
            "mean_apples": 0.0,
            "mean_moves": 0.0,
            "mean_length": 0.0,
            "mean_coverage_pct": 0.0,
        },
        "by_scenario": {},
        "history": [],
    }


def _read_json(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None


def _episode_fields(summary: dict[str, Any]) -> dict[str, Any]:
    apples = int(summary.get("apples_eaten") or summary.get("score") or 0)
    moves = int(summary.get("steps") or 0)
    length = int(summary.get("max_length") or summary.get("length") or 0)
    coverage = float(summary.get("coverage") or 0.0)
    outcome = str(summary.get("outcome") or "")
    scenario = str(summary.get("scenario_key") or "unknown")
    return {
        "apples": apples,
        "moves": moves,
        "length": length,
        "coverage_pct": round(coverage * 100, 1) if coverage <= 1 else round(coverage, 1),
        "outcome": outcome,
        "scenario_key": scenario,
    }


def _count_trajectories() -> int:
    path = trajectories_path()
    if not path.exists():
        return 0
    return sum(1 for line in path.read_text(encoding="utf-8").splitlines() if line.strip())


def _update_career_records(records: dict[str, Any], fields: dict[str, Any]) -> None:
    """Career best = the game with the most apples; moves and length come from that run."""
    apples = int(records.get("apples") or 0)
    new_apples = int(fields["apples"])
    if new_apples > apples:
        records["apples"] = new_apples
        records["moves"] = int(fields["moves"])
        records["length"] = int(fields["length"])
        records["coverage_pct"] = float(fields["coverage_pct"])
    elif new_apples == apples and new_apples > 0:
        if int(fields["length"]) >= int(records.get("length") or 0):
            records["length"] = int(fields["length"])
            records["moves"] = max(int(records.get("moves") or 0), int(fields["moves"]))
        records["coverage_pct"] = max(float(records.get("coverage_pct") or 0), float(fields["coverage_pct"]))


def read_career_records() -> dict[str, int | float]:
    stored = _read_json(snake_performance_path())
    if not stored:
        return {"apples": 0, "moves": 0, "length": 0, "coverage_pct": 0.0}
    records = stored.get("records") or {}
    return {
        "apples": int(records.get("apples") or 0),
        "moves": int(records.get("moves") or 0),
        "length": int(records.get("length") or 0),
        "coverage_pct": float(records.get("coverage_pct") or 0),
    }


def merge_career_with_live(
    *,
    career: dict[str, int | float] | None = None,
    live_apples: int = 0,
    live_moves: int = 0,
    live_length: int = 0,
) -> dict[str, int]:
    base = career or read_career_records()
    apples = max(int(base["apples"]), int(live_apples))
    if int(live_apples) >= int(base["apples"]) and int(live_apples) > 0:
        return {
            "apples": apples,
            "moves": int(live_moves),
            "length": int(live_length),
        }
    return {
        "apples": apples,
        "moves": int(base["moves"]),
        "length": int(base["length"]),
    }


def with_career_records(lab_snapshot: dict[str, Any]) -> dict[str, Any]:
    merged = merge_career_with_live(
        live_apples=int(lab_snapshot.get("live_best_apples") or 0),
        live_moves=int(lab_snapshot.get("live_best_moves") or 0),
        live_length=int(lab_snapshot.get("live_best_length") or 0),
    )
    lab_snapshot["record_apples"] = merged["apples"]
    lab_snapshot["record_moves"] = merged["moves"]
    lab_snapshot["record_length"] = merged["length"]
    lab_snapshot["career_records"] = merged
    return lab_snapshot


def _apply_episode_to_data(data: dict[str, Any], fields: dict[str, Any]) -> None:
    _update_career_records(data["records"], fields)

    totals = data["totals"]
    totals["episodes"] = int(totals.get("episodes") or 0) + 1
    if fields["outcome"] == "full_board":
        totals["full_boards"] = int(totals.get("full_boards") or 0) + 1

    outcomes = data.setdefault("outcomes", _empty_performance()["outcomes"])
    outcome_key = fields["outcome"] if fields["outcome"] in outcomes else "other"
    outcomes[outcome_key] = int(outcomes.get(outcome_key) or 0) + 1

    scenario = fields["scenario_key"]
    by_scenario: dict[str, Any] = data.setdefault("by_scenario", {})
    bucket = by_scenario.setdefault(
        scenario,
        {"episodes": 0, "best_apples": 0, "best_moves": 0, "best_length": 0},
    )
    bucket["episodes"] = int(bucket.get("episodes") or 0) + 1
    bucket["best_apples"] = max(int(bucket.get("best_apples") or 0), fields["apples"])
    bucket["best_moves"] = max(int(bucket.get("best_moves") or 0), fields["moves"])
    bucket["best_length"] = max(int(bucket.get("best_length") or 0), fields["length"])

    recent_window: list[dict[str, Any]] = data.setdefault("_recent_window", [])
    recent_window.append(fields)
    if len(recent_window) > 50:
        recent_window.pop(0)
    if recent_window:
        data["recent_50"] = {
            "mean_apples": round(sum(item["apples"] for item in recent_window) / len(recent_window), 2),
            "mean_moves": round(sum(item["moves"] for item in recent_window) / len(recent_window), 1),
            "mean_length": round(sum(item["length"] for item in recent_window) / len(recent_window), 2),
            "mean_coverage_pct": round(
                sum(item["coverage_pct"] for item in recent_window) / len(recent_window),
                1,
            ),
        }

    history: list[dict[str, Any]] = data.setdefault("history", [])
    episode_total = int(totals["episodes"])
    if episode_total == 1 or episode_total % 25 == 0:
        history.append(
            {
                "episode": episode_total,
                "at": datetime.now(UTC).isoformat(),
                "mean_apples": data["recent_50"]["mean_apples"],
                "mean_moves": data["recent_50"]["mean_moves"],
                "mean_length": data["recent_50"]["mean_length"],
                    "record_apples": data["records"]["apples"],
            }
        )
        data["history"] = history[-40:]


def rebuild_policy_performance_from_trajectories() -> dict[str, Any]:
    path = trajectories_path()
    data = _empty_performance()
    if not path.exists():
        return data

    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        summary = json.loads(line)
        _apply_episode_to_data(data, _episode_fields(summary))

    data["updated_at"] = datetime.now(UTC).isoformat()
    data.pop("_recent_window", None)
    snake_performance_path().parent.mkdir(parents=True, exist_ok=True)
    snake_performance_path().write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    return data


def list_recent_episodes(*, limit: int = 25) -> list[dict[str, Any]]:
    path = trajectories_path()
    if not path.exists():
        return []
    rows: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            rows.append(json.loads(line))
    page = rows[-limit:]
    result: list[dict[str, Any]] = []
    for row in reversed(page):
        fields = _episode_fields(row)
        result.append(
            {
                "episode_id": row.get("episode_id"),
                "scenario_key": fields["scenario_key"],
                "apples": fields["apples"],
                "moves": fields["moves"],
                "length": fields["length"],
                "outcome": fields["outcome"],
            }
        )
    return result


def read_policy_performance() -> dict[str, Any]:
    stored = _read_json(snake_performance_path()) or _empty_performance()
    traj_count = _count_trajectories()
    stored_episodes = int((stored.get("totals") or {}).get("episodes") or 0)
    if traj_count > stored_episodes:
        stored = rebuild_policy_performance_from_trajectories()

    stored.pop("_recent_window", None)
    eval_latest = _read_json(snake_acceptance_path())
    if eval_latest:
        stored["eval_latest"] = eval_latest

    from .policy_datasets import read_snake_dataset_summary

    stored["dataset"] = read_snake_dataset_summary()
    stored["recent_episodes"] = list_recent_episodes(limit=30)
    return stored


def update_policy_performance_from_episode(episode_summary: dict[str, Any]) -> dict[str, Any]:
    path = snake_performance_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    data = _read_json(path) or _empty_performance()
    fields = _episode_fields(episode_summary)
    _apply_episode_to_data(data, fields)
    data["updated_at"] = datetime.now(UTC).isoformat()
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    return data


def load_lab_records() -> dict[str, int]:
    career = read_career_records()
    return {
        "record_apples": int(career["apples"]),
        "record_moves": int(career["moves"]),
        "record_length": int(career["length"]),
    }
