from __future__ import annotations

import random
from collections import deque
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from packages.brainspa_environments.snake import (
    ACTION_COUNT,
    ACTION_NAMES,
    RewardDecomposer,
    SnakeArenaSim,
    SnakeSim,
    encode_arena_opponent,
    encode_arena_player,
    encode_state,
    state_dim_for_profile,
)
from packages.brainspa_environments.snake.wrappers import ENV_PROFILES, make_arena_sim


@dataclass
class TrainProgress:
    episode: int
    epsilon: float
    mean_reward: float
    mean_length: float
    mean_apples: float
    curriculum_stage: str
    last_outcome: str


class SnakeDQNAgent:
    def __init__(
        self,
        *,
        input_dim: int,
        hidden: int = 256,
        lr: float = 1e-3,
        gamma: float = 0.9,
        buffer_size: int = 10_000,
        batch_size: int = 64,
    ) -> None:
        import torch
        import torch.nn as nn

        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.gamma = gamma
        self.batch_size = batch_size
        self.memory: deque[tuple[list[float], int, float, list[float], bool]] = deque(maxlen=buffer_size)

        class _QNet(nn.Module):
            def __init__(self) -> None:
                super().__init__()
                self.net = nn.Sequential(
                    nn.Linear(input_dim, hidden),
                    nn.ReLU(),
                    nn.Linear(hidden, hidden),
                    nn.ReLU(),
                    nn.Linear(hidden, ACTION_COUNT),
                )

            def forward(self, x: torch.Tensor) -> torch.Tensor:
                return self.net(x)

        self.policy = _QNet().to(self.device)
        self.target = _QNet().to(self.device)
        self.target.load_state_dict(self.policy.state_dict())
        self.optimizer = torch.optim.Adam(self.policy.parameters(), lr=lr)
        self._torch = torch
        self._nn = nn

    def remember(self, state: list[float], action: int, reward: float, next_state: list[float], done: bool) -> None:
        self.memory.append((state, action, reward, next_state, done))

    def act(self, state: list[float], epsilon: float) -> int:
        if random.random() < epsilon:
            return random.randint(0, ACTION_COUNT - 1)
        torch = self._torch
        self.policy.eval()
        with torch.no_grad():
            tensor = torch.tensor([state], dtype=torch.float32, device=self.device)
            q = self.policy(tensor)
            return int(q.argmax(dim=1).item())

    def replay(self) -> float | None:
        if len(self.memory) < self.batch_size:
            return None
        torch = self._torch
        batch = random.sample(self.memory, self.batch_size)
        states, actions, rewards, next_states, dones = zip(*batch)
        state_t = torch.tensor(states, dtype=torch.float32, device=self.device)
        action_t = torch.tensor(actions, dtype=torch.long, device=self.device)
        reward_t = torch.tensor(rewards, dtype=torch.float32, device=self.device)
        next_t = torch.tensor(next_states, dtype=torch.float32, device=self.device)
        done_t = torch.tensor(dones, dtype=torch.bool, device=self.device)

        self.policy.train()
        current = self.policy(state_t).gather(1, action_t.unsqueeze(1)).squeeze(1)
        with torch.no_grad():
            next_q = self.target(next_t).max(dim=1).values
            target = reward_t + (self.gamma * next_q * ~done_t)
        loss = self._nn.functional.mse_loss(current, target)
        self.optimizer.zero_grad()
        loss.backward()
        self.optimizer.step()
        return float(loss.detach().cpu())

    def sync_target(self) -> None:
        self.target.load_state_dict(self.policy.state_dict())

    def save(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        self._torch.save(
            {
                "policy": self.policy.state_dict(),
                "target": self.target.state_dict(),
            },
            path,
        )

    def load(self, path: Path) -> None:
        payload = self._torch.load(path, map_location=self.device, weights_only=True)
        self.policy.load_state_dict(payload["policy"])
        self.target.load_state_dict(payload.get("target", payload["policy"]))


def run_arena_training_episode(
    agent: SnakeDQNAgent,
    *,
    epsilon: float = 0.2,
    seed: int | None = None,
) -> dict[str, Any]:
    arena = make_arena_sim(seed=seed)
    arena.reset(seed=seed)
    decomposer = RewardDecomposer(curriculum_stage="B")
    decomposer.reset(_arena_pseudo_snake_state(arena, "player"))
    transitions: list[dict[str, Any]] = []
    total_reward = 0.0
    reward_totals: dict[str, float] = {"arena_win": 0.0, "arena_loss": 0.0}

    while not arena.state.done:
        p_vec = encode_arena_player(arena)
        o_vec = encode_arena_opponent(arena)
        p_idx = agent.act(p_vec, epsilon)
        o_idx = agent.act(o_vec, epsilon)
        pseudo_before = _arena_pseudo_snake_state(arena, "player")
        step = arena.step(p_idx, o_idx)
        pseudo_after = _arena_pseudo_snake_state(arena, "player")
        breakdown = decomposer.step(
            pseudo_before,
            pseudo_after,
            ate_apple=step.player_ate,
        )
        next_vec = encode_arena_player(arena)
        agent.remember(p_vec, p_idx, breakdown.total, next_vec, arena.state.done)
        transitions.append(
            {
                "state_vector": p_vec,
                "action": ACTION_NAMES[p_idx],
                "action_index": p_idx,
                "reward_components": breakdown.to_dict(),
                "total_reward": breakdown.total,
                "done": arena.state.done,
                "env_profile": "arena",
            }
        )
        total_reward += breakdown.total

    if arena.state.winner == "player":
        bonus = 15.0
        reward_totals["arena_win"] = bonus
        total_reward += bonus
    elif arena.state.winner == "opponent":
        penalty = -15.0
        reward_totals["arena_loss"] = penalty
        total_reward += penalty

    s = arena.state
    return {
        "steps": s.steps,
        "score": s.player.score,
        "length": len(s.player.segments),
        "coverage": len(s.player.segments) / (s.grid_size * s.grid_size),
        "outcome": s.outcome,
        "total_reward": total_reward,
        "reward_totals": reward_totals,
        "transitions": transitions,
    }


def _arena_pseudo_snake_state(arena: SnakeArenaSim, role: str):
    from packages.brainspa_environments.snake.sim import SnakeState

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


def run_training_episode(
    agent: SnakeDQNAgent,
    *,
    env_profile: str = "solo",
    epsilon: float = 0.2,
    seed: int | None = None,
    curriculum_stage: str = "A",
) -> dict[str, Any]:
    sim = SnakeSim(seed=seed)
    state = sim.reset(seed=seed)
    decomposer = RewardDecomposer(curriculum_stage=curriculum_stage)
    decomposer.reset(state)
    profile = env_profile if env_profile in ENV_PROFILES else "solo"
    transitions: list[dict[str, Any]] = []
    total_reward = 0.0
    reward_totals: dict[str, float] = {}

    while not state.done:
        vector = encode_state(sim, state, env_profile=profile)
        action_idx = agent.act(vector, epsilon)
        step = sim.step(action_idx)
        breakdown = decomposer.step(state, step.state, ate_apple=step.ate_apple)
        next_vector = encode_state(sim, step.state, env_profile=profile)
        agent.remember(vector, action_idx, breakdown.total, next_vector, step.state.done)
        transitions.append(
            {
                "state_vector": vector,
                "action": ACTION_NAMES[action_idx],
                "action_index": action_idx,
                "reward_components": breakdown.to_dict(),
                "total_reward": breakdown.total,
                "done": step.state.done,
                "env_profile": profile,
            }
        )
        total_reward += breakdown.total
        for key, value in breakdown.to_dict().items():
            reward_totals[key] = reward_totals.get(key, 0.0) + value
        state = step.state

    return {
        "steps": state.steps,
        "score": state.score,
        "length": state.length,
        "coverage": state.coverage,
        "outcome": state.outcome,
        "total_reward": total_reward,
        "reward_totals": reward_totals,
        "transitions": transitions,
    }


def greedy_action(agent: SnakeDQNAgent, state_vector: list[float]) -> int:
    return agent.act(state_vector, epsilon=0.0)


def train_snake_policy(
    *,
    checkpoint_path: Path,
    episodes: int = 100,
    env_profiles: list[str] | None = None,
    on_episode: Any | None = None,
    should_stop: Any | None = None,
    start_episode: int = 0,
) -> dict[str, Any]:
    profiles = env_profiles or ["solo"]
    input_dim = max(state_dim_for_profile(p) for p in profiles)
    agent = SnakeDQNAgent(input_dim=input_dim)
    if checkpoint_path.exists():
        agent.load(checkpoint_path)

    epsilon = max(0.05, 1.0 - start_episode / max(episodes, 1))
    rewards_window: list[float] = []
    lengths_window: list[float] = []
    apples_window: list[float] = []
    curriculum = "A"

    last_episode = start_episode
    for episode in range(start_episode, episodes):
        last_episode = episode
        if should_stop and should_stop():
            break
        if episode > episodes * 0.4:
            curriculum = "B"
        if episode > episodes * 0.75:
            curriculum = "C"
        profile = profiles[episode % len(profiles)]
        if profile == "arena":
            result = run_arena_training_episode(agent, epsilon=epsilon, seed=episode)
        else:
            result = run_training_episode(
                agent,
                env_profile=profile,
                epsilon=epsilon,
                seed=episode,
                curriculum_stage=curriculum,
            )
        loss = agent.replay()
        if episode % 10 == 0:
            agent.sync_target()
        epsilon = max(0.01, epsilon * 0.995)
        rewards_window.append(result["total_reward"])
        lengths_window.append(float(result["length"]))
        apples_window.append(float(result["score"]))
        if len(rewards_window) > 50:
            rewards_window.pop(0)
            lengths_window.pop(0)
            apples_window.pop(0)

        progress = TrainProgress(
            episode=episode + 1,
            epsilon=round(epsilon, 4),
            mean_reward=sum(rewards_window) / len(rewards_window),
            mean_length=sum(lengths_window) / len(lengths_window),
            mean_apples=sum(apples_window) / len(apples_window),
            curriculum_stage=curriculum,
            last_outcome=str(result["outcome"]),
        )
        if on_episode:
            on_episode(progress, result)

        agent.save(checkpoint_path)

    return {
        "episodes_completed": last_episode + 1 if last_episode >= start_episode else start_episode,
        "checkpoint_path": str(checkpoint_path),
        "final_epsilon": epsilon,
    }