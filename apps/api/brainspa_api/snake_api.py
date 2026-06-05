from __future__ import annotations

import json
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from packages.brainspa_environments.snake import ACTION_NAMES, RewardDecomposer, SnakeSim, encode_state
from packages.brainspa_environments.snake.wrappers import env_profile_for_scenario, make_sim
from packages.brainspa_training.policy_trainer import SnakeDQNAgent, greedy_action

from .policy_datasets import append_episode
from .policy_paths import snake_checkpoint_path
from packages.brainspa_environments.snake.sim import new_episode_id
from packages.brainspa_environments.snake.state import state_dim_for_profile


@dataclass
class SnakeSession:
    session_id: str
    scenario_key: str
    mode: str
    sim: SnakeSim
    decomposer: RewardDecomposer
    env_profile: str
    transitions: list[dict[str, Any]] = field(default_factory=list)
    episode_id: str = ""
    reward_totals: dict[str, float] = field(default_factory=dict)
    agent: SnakeDQNAgent | None = None

    def __post_init__(self) -> None:
        if not self.episode_id:
            self.episode_id = new_episode_id()


_SESSIONS: dict[str, SnakeSession] = {}


def _load_agent(profile: str) -> SnakeDQNAgent | None:
    path = snake_checkpoint_path()
    if not path.exists():
        return None
    dim = state_dim_for_profile(profile)
    agent = SnakeDQNAgent(input_dim=dim)
    agent.load(path)
    return agent


def create_session(
    *,
    scenario_key: str,
    mode: str,
    seed: int | None = None,
) -> dict[str, Any]:
    session_id = f"sess-{uuid.uuid4().hex[:12]}"
    profile = env_profile_for_scenario(scenario_key)
    sim = make_sim(scenario_key=scenario_key, seed=seed)
    state = sim.reset(seed=seed)
    decomposer = RewardDecomposer()
    decomposer.reset(state)
    agent = None
    if mode in {"interactive_watch", "interactive_arena", "interactive_coach"} or scenario_key.startswith(
        "autonomous"
    ):
        agent = _load_agent(profile)

    session = SnakeSession(
        session_id=session_id,
        scenario_key=scenario_key,
        mode=mode,
        sim=sim,
        decomposer=decomposer,
        env_profile=profile,
        agent=agent,
    )
    _SESSIONS[session_id] = session
    return _public_session(session)


def get_session(session_id: str) -> dict[str, Any]:
    session = _SESSIONS.get(session_id)
    if not session:
        raise KeyError(session_id)
    return _public_session(session)


def step_session(session_id: str, action: str | int | None = None) -> dict[str, Any]:
    session = _SESSIONS[session_id]
    sim = session.sim
    state = sim.state
    if state.done:
        return _public_session(session)

    if action is None:
        if session.agent is None:
            from random import randint

            action_idx = randint(0, 3)
        else:
            vector = encode_state(sim, state, env_profile=session.env_profile)
            action_idx = greedy_action(session.agent, vector)
    elif isinstance(action, int):
        action_idx = action
    else:
        action_idx = ACTION_NAMES.index(action) if action in ACTION_NAMES else 0

    prev = state
    step = sim.step(action_idx)
    breakdown = session.decomposer.step(prev, step.state, ate_apple=step.ate_apple)
    session.transitions.append(
        {
            "state_vector": encode_state(sim, prev, env_profile=session.env_profile),
            "action": ACTION_NAMES[action_idx],
            "action_index": action_idx,
            "reward_components": breakdown.to_dict(),
            "total_reward": breakdown.total,
            "done": step.state.done,
            "env_profile": session.env_profile,
            "episode_id": session.episode_id,
        }
    )
    for key, value in breakdown.to_dict().items():
        session.reward_totals[key] = session.reward_totals.get(key, 0.0) + value

    payload = _public_session(session)
    payload["last_reward"] = breakdown.to_dict()
    return payload


def close_session(session_id: str) -> dict[str, Any]:
    session = _SESSIONS.pop(session_id, None)
    if not session:
        return {"closed": True, "session_id": session_id}
    state = session.sim.state
    if session.transitions:
        append_episode(
            {
                "episode_id": session.episode_id,
                "scenario_key": session.scenario_key,
                "steps": state.steps,
                "outcome": state.outcome,
                "reward_totals_by_component": session.reward_totals,
                "max_length": state.length,
                "apples_eaten": state.score,
                "coverage": state.coverage,
            },
            session.transitions,
        )
    return {"closed": True, "session_id": session_id, "episode_id": session.episode_id}


def coach_diff(session_id: str, human_session_id: str) -> dict[str, Any]:
    """Compare human transitions to policy actions."""
    human = _SESSIONS.get(human_session_id)
    agent = _load_agent("solo")
    if not human or not agent:
        return {"found": False, "message": "Sessions or checkpoint unavailable."}

    for index, row in enumerate(human.transitions):
        vector = row.get("state_vector") or []
        policy_idx = greedy_action(agent, vector)
        human_action = row.get("action")
        policy_action = ACTION_NAMES[policy_idx]
        if human_action != policy_action:
            return {
                "found": True,
                "step": index,
                "human_action": human_action,
                "policy_action": policy_action,
                "state_vector": vector,
            }
    return {"found": False, "message": "Policy agrees with all recorded human steps."}


def _public_session(session: SnakeSession) -> dict[str, Any]:
    state = session.sim.to_public_dict()
    policy_action = None
    if session.agent and not state.get("done"):
        vector = encode_state(session.sim, session.sim.state, env_profile=session.env_profile)
        idx = greedy_action(session.agent, vector)
        policy_action = ACTION_NAMES[idx]
    return {
        "session_id": session.session_id,
        "scenario_key": session.scenario_key,
        "mode": session.mode,
        "episode_id": session.episode_id,
        "world_state": state,
        "policy_action": policy_action,
        "transition_count": len(session.transitions),
        "checkpoint_ready": snake_checkpoint_path().exists(),
    }