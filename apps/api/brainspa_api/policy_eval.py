from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from packages.brainspa_environments.snake import ACTION_NAMES, RewardDecomposer, SnakeSim, encode_state
from packages.brainspa_environments.snake.wrappers import env_profile_for_scenario
from packages.brainspa_training.policy_trainer import SnakeDQNAgent, greedy_action, state_dim_for_profile

from .policy_paths import snake_acceptance_path, snake_checkpoint_path


def bfs_expert_action(sim: SnakeSim) -> int | None:
    """Shortest safe direction toward apple (oracle for metrics)."""
    from packages.brainspa_environments.snake.sim import ACTION_DELTAS

    state = sim.state
    if state.done:
        return None
    head = state.head
    apple = state.apple
    best_action = None
    best_dist = 10_000
    for idx, name in enumerate(ACTION_NAMES):
        if name == {"up": "down", "down": "up", "left": "right", "right": "left"}[state.direction]:
            continue
        dx, dy = ACTION_DELTAS[name]
        nxt = (head[0] + dx, head[1] + dy)
        if not (0 <= nxt[0] < state.grid_size and 0 <= nxt[1] < state.grid_size):
            continue
        if nxt in state.snake:
            continue
        dist = abs(nxt[0] - apple[0]) + abs(nxt[1] - apple[1])
        if dist < best_dist:
            best_dist = dist
            best_action = idx
    return best_action


def run_policy_eval(
    *,
    episodes: int = 100,
    scenario_key: str = "autonomous-watch",
    checkpoint: Path | None = None,
) -> dict[str, Any]:
    path = checkpoint or snake_checkpoint_path()
    profile = env_profile_for_scenario(scenario_key)
    input_dim = state_dim_for_profile(profile)
    agent = SnakeDQNAgent(input_dim=input_dim)
    if path.exists():
        agent.load(path)

    lengths: list[float] = []
    apples: list[float] = []
    coverages: list[float] = []
    outcomes: dict[str, int] = {}
    full_board_streak = 0
    max_full_board_streak = 0
    oracle_agreements = 0
    oracle_total = 0

    for ep in range(episodes):
        sim = SnakeSim(seed=ep + 10_000)
        state = sim.reset(seed=ep + 10_000)
        decomposer = RewardDecomposer(curriculum_stage="C")
        decomposer.reset(state)
        while not state.done:
            vector = encode_state(sim, state, env_profile=profile)
            action_idx = greedy_action(agent, vector)
            expert = bfs_expert_action(sim)
            if expert is not None:
                oracle_total += 1
                if expert == action_idx:
                    oracle_agreements += 1
            step = sim.step(action_idx)
            decomposer.step(state, step.state, ate_apple=step.ate_apple)
            state = step.state

        lengths.append(float(state.length))
        apples.append(float(state.score))
        coverages.append(state.coverage)
        outcomes[state.outcome] = outcomes.get(state.outcome, 0) + 1
        if state.outcome == "full_board":
            full_board_streak += 1
            max_full_board_streak = max(max_full_board_streak, full_board_streak)
        else:
            full_board_streak = 0

    full_board_count = outcomes.get("full_board", 0)
    result = {
        "episodes": episodes,
        "mean_length": sum(lengths) / len(lengths),
        "mean_apples": sum(apples) / len(apples),
        "mean_coverage": sum(coverages) / len(coverages),
        "full_board_count": full_board_count,
        "full_board_rate": full_board_count / episodes,
        "consecutive_full_board_max": max_full_board_streak,
        "death_breakdown": {
            "died_wall": outcomes.get("died_wall", 0),
            "died_self": outcomes.get("died_self", 0),
            "max_steps": outcomes.get("max_steps", 0),
        },
        "oracle_agreement_rate": (oracle_agreements / oracle_total) if oracle_total else 0.0,
        "passed": max_full_board_streak >= 10,
        "north_star": "10 consecutive full-board episodes",
    }
    artifact = snake_acceptance_path()
    artifact.parent.mkdir(parents=True, exist_ok=True)
    artifact.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    result["artifact_path"] = str(artifact)
    return result