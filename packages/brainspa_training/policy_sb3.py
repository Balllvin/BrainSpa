from __future__ import annotations

from pathlib import Path
from typing import Any


def sb3_available() -> bool:
    try:
        import stable_baselines3  # noqa: F401

        return True
    except ImportError:
        return False


def train_snake_sb3(
    *,
    checkpoint_path: Path,
    episodes: int = 100,
    env_profile: str = "solo",
    on_episode: Any | None = None,
    should_stop: Any | None = None,
) -> dict[str, Any]:
    if not sb3_available():
        raise RuntimeError(
            "stable-baselines3 is not installed. Install with: pip install stable-baselines3 gymnasium"
        )

    import gymnasium as gym
    import numpy as np
    from gymnasium import spaces
    from stable_baselines3 import DQN

    from packages.brainspa_environments.snake.gym_env import BrainSpaSnakeEnv
    from packages.brainspa_training.policy_trainer import TrainProgress

    inner = BrainSpaSnakeEnv(env_profile=env_profile)

    class _GymWrap(gym.Env):
        metadata = {"render_modes": []}

        def __init__(self) -> None:
            super().__init__()
            obs, _ = inner.reset(seed=0)
            self.observation_space = spaces.Box(low=0.0, high=1.0, shape=obs.shape, dtype=np.float32)
            self.action_space = spaces.Discrete(inner.action_space_n)

        def reset(self, *, seed: int | None = None, options: dict | None = None):
            return inner.reset(seed=seed)

        def step(self, action):
            return inner.step(int(action))

    env = _GymWrap()
    zip_path = Path(str(checkpoint_path) + ".zip")
    total_timesteps = max(episodes * 200, 10_000)

    if zip_path.exists():
        model = DQN.load(str(zip_path), env=env)
    else:
        model = DQN("MlpPolicy", env, verbose=0, learning_rate=1e-3, buffer_size=10_000, batch_size=64)

    chunk = 1000
    completed = 0
    for start in range(0, total_timesteps, chunk):
        if should_stop and should_stop():
            break
        model.learn(total_timesteps=min(chunk, total_timesteps - start), reset_num_timesteps=False)
        completed = start + chunk
        if on_episode:
            on_episode(
                TrainProgress(
                    episode=min(episodes, max(1, completed // 200)),
                    epsilon=0.01,
                    mean_reward=0.0,
                    mean_length=0.0,
                    mean_apples=0.0,
                    curriculum_stage="SB3",
                    last_outcome="learning",
                ),
                {"outcome": "sb3_chunk", "steps": chunk},
            )

    model.save(str(checkpoint_path))
    return {
        "episodes_completed": episodes,
        "checkpoint_path": str(zip_path),
        "backend": "sb3",
        "final_epsilon": 0.01,
    }