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
    hidden_dim_for_profile,
    state_dim_for_profile,
)
from packages.brainspa_environments.snake.wrappers import ENV_PROFILES, normalize_env_profile
from packages.brainspa_training.policy_trainer import SnakeDQNAgent, TrainProgress

LabPace = Literal["human", "watch", "train"]

# 8 steps/s — matches Brain Spa human-play harness (SNAKE_HUMAN_TICKS_PER_SEC).
HUMAN_INTERVAL_SEC = 0.125

PACE_CONFIG: dict[LabPace, dict[str, float | int]] = {
    "human": {"interval_sec": HUMAN_INTERVAL_SEC, "steps_per_slot": 1},
    "watch": {"interval_sec": 0.066, "steps_per_slot": 1},
    "train": {"interval_sec": 0.02, "steps_per_slot": 5},
}


def lab_tick_config(speed_multiplier: float) -> dict[str, float | int]:
    mult = max(0.25, min(32.0, speed_multiplier))
    return {
        "interval_sec": HUMAN_INTERVAL_SEC / mult,
        "steps_per_slot": max(1, min(5, int(round(mult)))),
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
    episode_logged: bool = False

    def reset(self, *, seed: int) -> None:
        state = self.sim.reset(seed=seed)
        self.decomposer.reset(state)
        self.transitions = []
        self.episode_reward = 0.0
        self.reward_totals = {}
        self.last_outcome = None
        self.episode_logged = False


class SnakeTrainLab:
    """Parallel solo envs sharing one DQN checkpoint for visible fast training."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.running = False
        self.pace: LabPace = "train"
        self.speed_multiplier: float = 1.0
        self.slots: list[_LabSlot] = []
        self.agent: SnakeDQNAgent | None = None
        self.checkpoint_path: Path | None = None
        self.episodes_target = 100
        self.episodes_completed = 0
        self.episodes_started = 0
        self.epsilon = 1.0
        self.rewards_window: list[float] = []
        self.lengths_window: list[float] = []
        self.apples_window: list[float] = []
        self.record_apples = 0
        self.record_moves = 0
        self.record_length = 0
        self.curriculum = "A"
        self._on_progress: Callable[[TrainProgress, dict[str, Any]], None] | None = None
        self._should_stop: Callable[[], bool] | None = None
        self._slot_seeds: list[int] = []

    def load_career_records(self, *, apples: int, moves: int, length: int) -> None:
        self.record_apples = max(self.record_apples, int(apples))
        self.record_moves = max(self.record_moves, int(moves))
        self.record_length = max(self.record_length, int(length))

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
        speed_multiplier: float = 1.0,
        env_profiles: list[str] | None = None,
    ) -> dict[str, Any]:
        with self._lock:
            profiles = [
                normalize_env_profile(p)
                for p in (env_profiles or ["coords"])
                if normalize_env_profile(p) in ENV_PROFILES and normalize_env_profile(p) != "arena"
            ]
            if not profiles:
                profiles = ["coords"]
            # Parallel boards share one weight matrix — keep encodings on one profile for stability.
            profiles = [profiles[0]]
            profile = profiles[0]
            count = max(1, min(6, slots))
            input_dim = state_dim_for_profile(profile)
            agent = SnakeDQNAgent(input_dim=input_dim, hidden=hidden_dim_for_profile(profile))
            if checkpoint_path.exists():
                try:
                    agent.load(checkpoint_path)
                except ValueError:
                    pass

            self.agent = agent
            self.checkpoint_path = checkpoint_path
            self.episodes_target = max(10, episodes_target)
            self.pace = pace if pace in PACE_CONFIG else "train"
            self.speed_multiplier = max(0.25, min(32.0, speed_multiplier))
            self.episodes_completed = 0
            self.episodes_started = 0
            self.epsilon = 0.3
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
                    decomposer=RewardDecomposer(
                        curriculum_stage=self.curriculum,
                        reward_mode="sparse" if profile == "coords" else "shaped",
                    ),
                )
                slot.reset(seed=self._slot_seeds[index])
                self.slots.append(slot)
            self.episodes_started = len(self.slots)
            return self.snapshot()

    def stop(self) -> dict[str, Any]:
        with self._lock:
            self.running = False
            return self.snapshot()

    def clear_history(self) -> None:
        with self._lock:
            self.running = False
            self.slots = []
            self.agent = None
            self.checkpoint_path = None
            self.episodes_completed = 0
            self.episodes_started = 0
            self.episodes_target = 100
            self.epsilon = 0.3
            self.rewards_window = []
            self.lengths_window = []
            self.apples_window = []
            self.record_apples = 0
            self.record_moves = 0
            self.record_length = 0
            self.curriculum = "A"

    def set_episodes_target(self, episodes_target: int) -> dict[str, Any]:
        with self._lock:
            self.episodes_target = max(10, min(10_000, int(episodes_target)))
            if self.running and self.episodes_completed >= self.episodes_target:
                self._try_complete_lab()
            return self.snapshot()

    def set_speed_multiplier(self, speed_multiplier: float) -> dict[str, Any]:
        with self._lock:
            self.speed_multiplier = max(0.25, min(32.0, speed_multiplier))
            return self.snapshot()

    def tick(self) -> dict[str, Any]:
        with self._lock:
            if not self.running or not self.agent or not self.slots:
                return self.snapshot()

            if self._should_stop and self._should_stop():
                self.running = False
                return self.snapshot()

            cfg = lab_tick_config(self.speed_multiplier)
            steps = int(cfg["steps_per_slot"])
            for slot in self.slots:
                for _ in range(steps):
                    if not slot.sim.state.done:
                        self._step_slot(slot)
                    if slot.sim.state.done and not slot.episode_logged:
                        self._finish_slot_episode(slot)
                        if not self.running:
                            break
                        if self.episodes_started < self.episodes_target:
                            slot.reset(seed=self._slot_seeds[slot.index] + self.episodes_completed)
                            self.episodes_started += 1
                    if not self.running:
                        break
                if not self.running:
                    break

            completed = self.episodes_completed
            if completed > 0 and completed % 5 == 0:
                self.agent.replay()
            if completed > 0 and completed % 10 == 0:
                self.agent.sync_target()
            if self.checkpoint_path and completed > 0 and completed % 3 == 0:
                self.agent.save(self.checkpoint_path)

            return self.snapshot()

    def stream_interval_sec(self) -> float:
        return float(lab_tick_config(self.speed_multiplier)["interval_sec"])

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

        self.record_apples = max(self.record_apples, int(state.score))
        self.record_moves = max(self.record_moves, int(state.steps))
        self.record_length = max(self.record_length, int(state.length))

        slot.episode_logged = True
        self.episodes_completed += 1
        ratio = self.episodes_completed / max(self.episodes_target, 1)
        if ratio > 0.4:
            self.curriculum = "B"
        if ratio > 0.75:
            self.curriculum = "C"
        for s in self.slots:
            s.curriculum = self.curriculum
            s.decomposer = RewardDecomposer(
                curriculum_stage=self.curriculum,
                reward_mode="sparse" if s.profile == "coords" else "shaped",
            )

        self.epsilon = max(0.01, self.epsilon * 0.995)
        self.rewards_window.append(slot.episode_reward)
        self.lengths_window.append(float(state.length))
        self.apples_window.append(float(state.score))
        for window in (self.rewards_window, self.lengths_window, self.apples_window):
            if len(window) > 50:
                window.pop(0)

        progress = TrainProgress(
            episode=self.episodes_completed,
            epsilon=round(self.epsilon, 4),
            mean_reward=sum(self.rewards_window) / len(self.rewards_window),
            mean_length=sum(self.lengths_window) / len(self.lengths_window),
            mean_apples=sum(self.apples_window) / len(self.apples_window),
            curriculum_stage=self.curriculum,
            last_outcome=str(state.outcome),
        )
        if self._on_progress:
            self._on_progress(progress, result)

        self._try_complete_lab()

    def _try_complete_lab(self) -> None:
        if self.episodes_completed < self.episodes_target:
            return
        if any(not slot.sim.state.done for slot in self.slots):
            return
        self.running = False
        if self.checkpoint_path and self.agent:
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
        live_best_apples = max((slot.sim.state.score for slot in self.slots), default=0)
        live_best_moves = max((slot.sim.state.steps for slot in self.slots), default=0)
        live_best_length = max((slot.sim.state.length for slot in self.slots), default=0)
        return {
            "running": self.running,
            "pace": self.pace,
            "speed_multiplier": round(self.speed_multiplier, 2),
            "slots": worlds,
            "slot_count": len(self.slots),
            "episode": self.episodes_completed,
            "episodes_started": self.episodes_started,
            "episodes_target": self.episodes_target,
            "draining": (
                self.running
                and self.episodes_started >= self.episodes_target
                and self.episodes_completed < self.episodes_target
            ),
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
            "record_apples": max(self.record_apples, int(live_best_apples)),
            "record_moves": max(self.record_moves, int(live_best_moves)),
            "record_length": max(self.record_length, int(live_best_length)),
            "live_best_apples": int(live_best_apples),
            "live_best_moves": int(live_best_moves),
            "live_best_length": int(live_best_length),
        }


_LAB = SnakeTrainLab()


def get_snake_train_lab() -> SnakeTrainLab:
    return _LAB