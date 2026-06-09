from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Any, Literal

from packages.brainspa_environments.snake import (
    ACTION_NAMES,
    RewardDecomposer,
    SnakeArenaSim,
    SnakeSim,
    encode_arena_opponent,
    encode_arena_player,
    encode_state,
)
from packages.brainspa_environments.snake.sim import SnakeState, new_episode_id
from packages.brainspa_environments.snake.state import hidden_dim_for_profile, state_dim_for_profile
from packages.brainspa_environments.snake.wrappers import (
    env_profile_for_scenario,
    normalize_env_profile,
    is_arena_scenario,
    make_arena_sim,
    make_sim,
)
from packages.brainspa_training.policy_trainer import SnakeDQNAgent, greedy_action

from .policy_datasets import append_episode
from .policy_paths import snake_checkpoint_path
from .snake_session_store import archive_session, list_archived_sessions, load_archived_session


@dataclass
class SnakeSession:
    session_id: str
    scenario_key: str
    mode: str
    env_profile: str
    sim: SnakeSim | None = None
    arena: SnakeArenaSim | None = None
    decomposer: RewardDecomposer = field(default_factory=RewardDecomposer)
    transitions: list[dict[str, Any]] = field(default_factory=list)
    episode_id: str = ""
    reward_totals: dict[str, float] = field(default_factory=dict)
    agent: SnakeDQNAgent | None = None
    coach_index: int = 0

    def __post_init__(self) -> None:
        if not self.episode_id:
            self.episode_id = new_episode_id()


_SESSIONS: dict[str, SnakeSession] = {}


def _load_agent(profile: str) -> SnakeDQNAgent | None:
    path = snake_checkpoint_path()
    if not path.exists():
        return None
    dim = state_dim_for_profile(profile)
    agent = SnakeDQNAgent(input_dim=dim, hidden=hidden_dim_for_profile(profile))
    try:
        agent.load(path)
    except Exception:
        return None
    return agent


def create_session(
    *,
    scenario_key: str,
    mode: str,
    seed: int | None = None,
) -> dict[str, Any]:
    session_id = f"sess-{uuid.uuid4().hex[:12]}"
    profile = env_profile_for_scenario(scenario_key)
    arena_mode = is_arena_scenario(scenario_key)

    session = SnakeSession(
        session_id=session_id,
        scenario_key=scenario_key,
        mode=mode,
        env_profile=profile,
    )

    if arena_mode:
        arena = make_arena_sim(seed=seed)
        arena.reset(seed=seed)
        session.arena = arena
    else:
        sim = make_sim(scenario_key=scenario_key, seed=seed)
        state = sim.reset(seed=seed)
        session.sim = sim
        session.decomposer.reset(state)

    if mode in {"interactive_watch", "interactive_coach"} or scenario_key.startswith("autonomous"):
        session.agent = _load_agent(profile)
    if scenario_key in {"human-vs-ai", "dual-arena"}:
        session.agent = _load_agent("arena")

    _SESSIONS[session_id] = session
    return _public_session(session)


def get_session(session_id: str) -> dict[str, Any]:
    session = _SESSIONS.get(session_id)
    if not session:
        raise KeyError(session_id)
    return _public_session(session)


def step_session(
    session_id: str,
    action: str | int | None = None,
    *,
    actor: Literal["player", "opponent", "auto"] = "auto",
) -> dict[str, Any]:
    session = _SESSIONS[session_id]
    if session.arena is not None:
        return _step_arena(session, action, actor=actor)
    return _step_solo(session, action)


def _step_solo(session: SnakeSession, action: str | int | None) -> dict[str, Any]:
    sim = session.sim
    if sim is None:
        raise RuntimeError("Solo sim missing")
    state = sim.state
    if state.done:
        return _public_session(session)

    action_idx = _resolve_action(session, action)
    prev = state
    step = sim.step(action_idx)
    breakdown = session.decomposer.step(prev, step.state, ate_apple=step.ate_apple)
    _record_transition(session, sim, prev, action_idx, breakdown, step.state.done)
    payload = _public_session(session)
    payload["last_reward"] = breakdown.to_dict()
    return payload


def _step_arena(
    session: SnakeSession,
    action: str | int | None,
    *,
    actor: str,
) -> dict[str, Any]:
    arena = session.arena
    if arena is None:
        raise RuntimeError("Arena sim missing")
    if arena.state.done:
        return _public_session(session)

    if session.scenario_key == "dual-arena":
        p_vec = encode_arena_player(arena)
        o_vec = encode_arena_opponent(arena)
        p_idx = greedy_action(session.agent, p_vec) if session.agent else 0
        o_idx = greedy_action(session.agent, o_vec) if session.agent else 1
    elif session.scenario_key == "human-vs-ai":
        p_idx = _resolve_action(session, action)
        o_vec = encode_arena_opponent(arena)
        o_idx = greedy_action(session.agent, o_vec) if session.agent else 0
    else:
        p_idx = _resolve_action(session, action)
        o_idx = 0

    world_before = arena.to_public_dict()
    prev_player = _arena_pseudo(arena, "player")
    step = arena.step(p_idx, o_idx)
    pseudo_after = _arena_pseudo(arena, "player")
    breakdown = session.decomposer.step(prev_player, pseudo_after, ate_apple=step.player_ate)
    if arena.state.done:
        if arena.state.winner == "player":
            breakdown.total += 10.0
        elif arena.state.winner == "opponent":
            breakdown.total -= 10.0

    vector = encode_arena_player(arena)
    session.transitions.append(
        {
            "state_vector": vector,
            "head": list(prev_player.head),
            "world_state": world_before,
            "action": ACTION_NAMES[p_idx],
            "action_index": p_idx,
            "opponent_action": ACTION_NAMES[o_idx],
            "reward_components": breakdown.to_dict(),
            "total_reward": breakdown.total,
            "done": arena.state.done,
            "env_profile": "arena",
            "episode_id": session.episode_id,
        }
    )
    for key, value in breakdown.to_dict().items():
        session.reward_totals[key] = session.reward_totals.get(key, 0.0) + value

    payload = _public_session(session)
    payload["last_reward"] = breakdown.to_dict()
    payload["opponent_action"] = ACTION_NAMES[o_idx]
    return payload


def _resolve_action(session: SnakeSession, action: str | int | None) -> int:
    if action is None:
        if session.agent and session.sim:
            vector = encode_state(session.sim, session.sim.state, env_profile=session.env_profile)
            return greedy_action(session.agent, vector)
        from random import randint

        return randint(0, 3)
    if isinstance(action, int):
        return action % 4
    return ACTION_NAMES.index(action) if action in ACTION_NAMES else 0


def _solo_world_from_state(state: SnakeState) -> dict[str, Any]:
    return {
        "grid_size": state.grid_size,
        "snake": [list(segment) for segment in state.snake],
        "direction": state.direction,
        "apple": list(state.apple),
        "score": state.score,
        "steps": state.steps,
        "length": state.length,
        "coverage": round(state.coverage, 4),
        "done": state.done,
        "outcome": state.outcome,
    }


def _record_transition(
    session: SnakeSession,
    sim: SnakeSim,
    prev: SnakeState,
    action_idx: int,
    breakdown: Any,
    done: bool,
) -> None:
    session.transitions.append(
        {
            "state_vector": encode_state(sim, prev, env_profile=session.env_profile),
            "head": list(prev.head),
            "world_state": _solo_world_from_state(prev),
            "action": ACTION_NAMES[action_idx],
            "action_index": action_idx,
            "reward_components": breakdown.to_dict(),
            "total_reward": breakdown.total,
            "done": done,
            "env_profile": session.env_profile,
            "episode_id": session.episode_id,
        }
    )
    for key, value in breakdown.to_dict().items():
        session.reward_totals[key] = session.reward_totals.get(key, 0.0) + value


def close_session(session_id: str) -> dict[str, Any]:
    session = _SESSIONS.pop(session_id, None)
    if not session:
        return {"closed": True, "session_id": session_id}

    summary = _session_summary(session)
    if session.transitions:
        append_episode(
            {
                "episode_id": session.episode_id,
                "scenario_key": session.scenario_key,
                **summary,
            },
            session.transitions,
        )

    if session.scenario_key in {"human-play", "human-vs-ai", "coach-replay"}:
        archive_session(
            {
                "session_id": session.session_id,
                "scenario_key": session.scenario_key,
                "episode_id": session.episode_id,
                "summary": summary,
                "transitions": session.transitions,
            }
        )

    return {"closed": True, "session_id": session_id, "episode_id": session.episode_id, "archived": True}


def list_coach_sessions() -> list[dict[str, Any]]:
    return list_archived_sessions()


def coach_diff_for_session(session_id: str, *, step: int | None = None) -> dict[str, Any]:
    archived = load_archived_session(session_id)
    transitions = (archived or {}).get("transitions") or []
    if not archived and session_id in _SESSIONS:
        transitions = _SESSIONS[session_id].transitions

    profile = "coords"
    if transitions:
        profile = normalize_env_profile(str(transitions[0].get("env_profile") or "coords"))
    agent = _load_agent(profile)
    if not agent and profile != "coords":
        agent = _load_agent("coords")
    if not agent or not transitions:
        return {"found": False, "message": "No transitions or checkpoint unavailable."}

    indices = range(len(transitions)) if step is None else [step]
    for index in indices:
        if index < 0 or index >= len(transitions):
            continue
        row = transitions[index]
        vector = row.get("state_vector") or []
        policy_idx = greedy_action(agent, vector)
        human_action = row.get("action")
        policy_action = ACTION_NAMES[policy_idx]
        head = row.get("head")
        if human_action != policy_action:
            return {
                "found": True,
                "step": index,
                "total_steps": len(transitions),
                "human_action": human_action,
                "policy_action": policy_action,
                "head": head,
                "session_id": session_id,
            }
    message = (
        "Policy agrees at this step."
        if step is not None
        else "Policy agrees with all recorded steps."
    )
    return {
        "found": False,
        "message": message,
        "total_steps": len(transitions),
        "session_id": session_id,
    }


def _world_state_for_replay(row: dict[str, Any]) -> dict[str, Any] | None:
    stored = row.get("world_state")
    if isinstance(stored, dict):
        if stored.get("snake") is not None:
            return stored
        if stored.get("mode") == "arena" and stored.get("player"):
            return stored
    head = row.get("head")
    if not head:
        return None
    return {
        "grid_size": 10,
        "snake": [list(head)],
        "direction": "up",
        "apple": [5, 5],
        "score": 0,
        "steps": 0,
        "length": 1,
        "coverage": 0.01,
        "done": False,
        "outcome": "in_progress",
    }


def coach_step_replay(session_id: str, step_index: int) -> dict[str, Any]:
    archived = load_archived_session(session_id)
    transitions = (archived or {}).get("transitions") or []
    if step_index < 0 or step_index >= len(transitions):
        return {"ok": False, "message": "Step out of range"}
    row = transitions[step_index]
    diff = coach_diff_for_session(session_id, step=step_index)
    return {
        "ok": True,
        "step": step_index,
        "transition": row,
        "diff": diff,
        "world_state": _world_state_for_replay(row),
        "total_steps": len(transitions),
    }


def _arena_pseudo(arena: SnakeArenaSim, role: str) -> SnakeState:
    s = arena.state
    snake = s.player if role == "player" else s.opponent
    return SnakeState(
        grid_size=s.grid_size,
        snake=snake.segments,
        direction=snake.direction,
        apple=s.apple,
        score=snake.score,
        steps=s.steps,
        done=s.done,
        outcome="in_progress",
    )


def _session_summary(session: SnakeSession) -> dict[str, Any]:
    if session.arena:
        s = session.arena.state
        return {
            "steps": s.steps,
            "outcome": s.outcome,
            "reward_totals_by_component": session.reward_totals,
            "max_length": len(s.player.segments),
            "apples_eaten": s.player.score,
            "coverage": len(s.player.segments) / (s.grid_size * s.grid_size),
            "winner": s.winner,
        }
    sim = session.sim
    if not sim:
        return {}
    state = sim.state
    return {
        "steps": state.steps,
        "outcome": state.outcome,
        "reward_totals_by_component": session.reward_totals,
        "max_length": state.length,
        "apples_eaten": state.score,
        "coverage": state.coverage,
    }


def _public_session(session: SnakeSession) -> dict[str, Any]:
    if session.arena:
        world = session.arena.to_public_dict()
        policy_action = None
        opponent_action = None
        if session.agent and not world.get("done"):
            if world["player"]["alive"]:
                policy_action = ACTION_NAMES[greedy_action(session.agent, encode_arena_player(session.arena))]
            if world["opponent"]["alive"]:
                opponent_action = ACTION_NAMES[
                    greedy_action(session.agent, encode_arena_opponent(session.arena))
                ]
    else:
        world = session.sim.to_public_dict() if session.sim else {}
        policy_action = None
        if session.agent and session.sim and not world.get("done"):
            vector = encode_state(session.sim, session.sim.state, env_profile=session.env_profile)
            policy_action = ACTION_NAMES[greedy_action(session.agent, vector)]
        opponent_action = None

    return {
        "session_id": session.session_id,
        "scenario_key": session.scenario_key,
        "mode": session.mode,
        "episode_id": session.episode_id,
        "world_state": world,
        "policy_action": policy_action,
        "opponent_action": opponent_action,
        "transition_count": len(session.transitions),
        "checkpoint_ready": snake_checkpoint_path().exists(),
    }