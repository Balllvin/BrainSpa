from __future__ import annotations

import random
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Literal

from packages.brainspa_environments.snake import (
    ACTION_NAMES,
    RewardDecomposer,
    SnakeSim,
    encode_state,
    state_dim_for_profile,
)
from packages.brainspa_environments.snake.wrappers import ENV_PROFILES
from packages.brainspa_training.policy_trainer import SnakeDQNAgent, TrainProgress

LabPace = Literal["human", "watch", "train"]

PACE_CONFIG: dict[LabPace, dict[str, float | int]] = {
    "human": {"interval_sec": 0.125, "steps_per_slot": 1},
    "watch": {"interval_sec": 0.066, "steps_per_slot": 1},
    "train": {"interval_sec": 0.02, "steps_per_slot": 5},
}


@dataclass
class _LabSlot:
    index: int
    profile: str
    sim: SnakeSim
    decomposer: RewardDecomposer
    curriculum: str = "A"
    transitions: list[dict[str, Any]] = field(default_factory=list)
    episode_reward: float = 0.0
    reward_totals: dict[str, float] = field(default_factory=dict)
    last_outcome: str | None = None

    def reset(self, *, seed: int) -> None:
        state = self.sim.reset(seed=seed)
        self.decomposer.reset(state)
        self.transitions = []
        self.episode_reward = 0.0
        self.reward_totals = {}
        self.last_outcome = None


class SnakeTrainLab:
    """Parallel solo envs sharing one DQN checkpoint for visible fast training."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.running = False
        self.pace: LabPace = "train"
        self.slots: list[_LabSlot] = []
        self.agent: SnakeDQNAgent | None = None
        self.checkpoint_path: Path | None = None
        self.episodes_target = 100
        self.global_episode = 0
        self.epsilon = 1.0
        self.rewards_window: list[float] = []
        self.lengths_window: list[float] = []
        self.apples_window: list[float] = []
        self.curriculum = "A"
        self._on_progress: Callable[[TrainProgress, dict[str, Any]], None] | None = None
        self._should_stop: Callable[[], bool] | None = None
        self._slot_seeds: list[int] = []

    def configure_callbacks(
        self,
        *,
        on_progress: Callable[[TrainProgress, dict[str, Any]], None] | None = None,
        should_stop: Callable[[], bool] | None = None,
    ) -> None:
        self._on_progress = on_progress
        self._should_stop = should_stop

    def start(
        self,
        *,
        checkpoint_path: Path,
        slots: int = 6,
        episodes_target: int = 100,
        pace: LabPace = "train",
        env_profiles: list[str] | None = None,
    ) -> dict[str, Any]:
        with self._lock:
            profiles = [p for p in (env_profiles or ["solo"]) if p in ENV_PROFILES and p != "arena"]
            if not profiles:
                profiles = ["solo"]
            # Parallel boards share one weight matrix — keep encodings on one profile for stability.
            profiles = [profiles[0]]
            count = max(1, min(6, slots))
            input_dim = max(state_dim_for_profile(p) for p in profiles)
            agent = SnakeDQNAgent(input_dim=input_dim)
            if checkpoint_path.exists():
                agent.load(checkpoint_path)

            self.agent = agent
            self.checkpoint_path = checkpoint_path
            self.episodes_target = max(10, episodes_target)
            self.pace = pace if pace in PACE_CONFIG else "train"
            self.global_episode = 0
            self.epsilon = 0.2
            self.rewards_window = []
            self.lengths_window = []
            self.apples_window = []
            self.curriculum = "A"
            self.running = True
            self._slot_seeds = [random.randint(0, 1_000_000) for _ in range(count)]
            self.slots = []
            for index in range(count):
                profile = profiles[index % len(profiles)]
                sim = SnakeSim(seed=self._slot_seeds[index])
                slot = _LabSlot(
                    index=index,
                    profile=profile,
                    sim=sim,
                    decomposer=RewardDecomposer(curriculum_stage=self.curriculum),
                )
                slot.reset(seed=self._slot_seeds[index])
                self.slots.append(slot)
            return self.snapshot()

    def stop(self) -> dict[str, Any]:
        with self._lock:
            self.running = False
            return self.snapshot()

    def tick(self) -> dict[str, Any]:
        with self._lock:
            if not self.running or not self.agent or not self.slots:
                return self.snapshot()

            if self._should_stop and self._should_stop():
                self.running = False
                return self.snapshot()

            cfg = PACE_CONFIG[self.pace]
            steps = int(cfg["steps_per_slot"])
            for slot in self.slots:
                for _ in range(steps):
                    if slot.sim.state.done:
                        self._finish_slot_episode(slot)
                        if not self.running:
                            break
                        slot.reset(seed=self._slot_seeds[slot.index] + self.global_episode)
                    if not self.running:
                        break
                    self._step_slot(slot)
                if not self.running:
                    break

            if self.global_episode > 0 and self.global_episode % 5 == 0:
                self.agent.replay()
            if self.global_episode > 0 and self.global_episode % 10 == 0:
                self.agent.sync_target()
            if self.checkpoint_path and self.global_episode > 0 and self.global_episode % 3 == 0:
                self.agent.save(self.checkpoint_path)

            return self.snapshot()

    def stream_interval_sec(self) -> float:
        return float(PACE_CONFIG[self.pace]["interval_sec"])

    def _step_slot(self, slot: _LabSlot) -> None:
        assert self.agent is not None
        state = slot.sim.state
        vector = encode_state(slot.sim, state, env_profile=slot.profile)
        action_idx = self.agent.act(vector, self.epsilon)
        step = slot.sim.step(action_idx)
        breakdown = slot.decomposer.step(state, step.state, ate_apple=step.ate_apple)
        next_vector = encode_state(slot.sim, step.state, env_profile=slot.profile)
        self.agent.remember(vector, action_idx, breakdown.total, next_vector, step.state.done)
        slot.episode_reward += breakdown.total
        for key, value in breakdown.to_dict().items():
            slot.reward_totals[key] = slot.reward_totals.get(key, 0.0) + value
        slot.transitions.append(
            {
                "state_vector": vector,
                "action": ACTION_NAMES[action_idx],
                "action_index": action_idx,
                "reward_components": breakdown.to_dict(),
                "total_reward": breakdown.total,
                "done": step.state.done,
                "env_profile": slot.profile,
            }
        )
        if step.state.done:
            slot.last_outcome = step.state.outcome

    def _finish_slot_episode(self, slot: _LabSlot) -> None:
        assert self.agent is not None
        state = slot.sim.state
        result = {
            "steps": state.steps,
            "score": state.score,
            "length": state.length,
            "coverage": state.coverage,
            "outcome": state.outcome,
            "total_reward": slot.episode_reward,
            "reward_totals": slot.reward_totals,
            "transitions": slot.transitions,
            "env_profile": slot.profile,
        }

        self.global_episode += 1
        ratio = self.global_episode / max(self.episodes_target, 1)
        if ratio > 0.4:
            self.curriculum = "B"
        if ratio > 0.75:
            self.curriculum = "C"
        for s in self.slots:
            s.curriculum = self.curriculum
            s.decomposer = RewardDecomposer(curriculum_stage=self.curriculum)

        self.epsilon = max(0.01, self.epsilon * 0.995)
        self.rewards_window.append(slot.episode_reward)
        self.lengths_window.append(float(state.length))
        self.apples_window.append(float(state.score))
        for window in (self.rewards_window, self.lengths_window, self.apples_window):
            if len(window) > 50:
                window.pop(0)

        progress = TrainProgress(
            episode=self.global_episode,
            epsilon=round(self.epsilon, 4),
            mean_reward=sum(self.rewards_window) / len(self.rewards_window),
            mean_length=sum(self.lengths_window) / len(self.lengths_window),
            mean_apples=sum(self.apples_window) / len(self.apples_window),
            curriculum_stage=self.curriculum,
            last_outcome=str(state.outcome),
        )
        if self._on_progress:
            self._on_progress(progress, result)

        if self.global_episode >= self.episodes_target:
            self.running = False
            if self.checkpoint_path:
                self.agent.save(self.checkpoint_path)

    def snapshot(self) -> dict[str, Any]:
        worlds = []
        for slot in self.slots:
            worlds.append(
                {
                    "index": slot.index,
                    "profile": slot.profile,
                    "world_state": slot.sim.to_public_dict(),
                    "episode_reward": round(slot.episode_reward, 2),
                    "last_outcome": slot.last_outcome,
                }
            )
        mean_reward = sum(self.rewards_window) / len(self.rewards_window) if self.rewards_window else 0.0
        return {
            "running": self.running,
            "pace": self.pace,
            "slots": worlds,
            "slot_count": len(self.slots),
            "episode": self.global_episode,
            "episodes_target": self.episodes_target,
            "epsilon": round(self.epsilon, 4),
            "mean_reward": round(mean_reward, 3),
            "mean_length": round(sum(self.lengths_window) / len(self.lengths_window), 2)
            if self.lengths_window
            else 0.0,
            "mean_apples": round(sum(self.apples_window) / len(self.apples_window), 2)
            if self.apples_window
            else 0.0,
            "curriculum_stage": self.curriculum,
            "checkpoint_ready": bool(self.checkpoint_path and self.checkpoint_path.exists()),
        }


_LAB = SnakeTrainLab()


def get_snake_train_lab() -> SnakeTrainLab:
    return _LAB