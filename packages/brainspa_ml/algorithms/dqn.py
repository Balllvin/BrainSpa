"""Deep Q-Network (DQN) — environment-agnostic.

The same value-based method the Snake reference used, refactored so it trains
any environment in the registry: experience replay, a target network, and
epsilon-greedy exploration with linear decay.

References: Mnih et al. (2015); CleanRL dqn.py.
"""

from __future__ import annotations

import random
from collections import deque
from pathlib import Path
from typing import Any, Callable

from ..environments import Environment, EnvSpec
from .base import AlgorithmSpec, Policy, evaluate_policy, register_algorithm
from .torch_nets import GreedyQPolicy, QNetwork, infer_dims, load_qnet, save_qnet, torch_device

DEFAULTS: dict[str, Any] = {
    "total_steps": 40000,
    "buffer_size": 10000,
    "batch_size": 128,
    "gamma": 0.99,
    "learning_rate": 0.0005,
    "hidden": 128,
    "epsilon_start": 1.0,
    "epsilon_end": 0.05,
    "exploration_fraction": 0.5,
    "learning_starts": 1000,
    "train_frequency": 4,
    "target_update_interval": 500,
    "max_steps": 500,
    "seed": 0,
}


def _epsilon(step: int, total: int, start: float, end: float, fraction: float) -> float:
    duration = max(1, int(fraction * total))
    if step >= duration:
        return end
    return start + (end - start) * (step / duration)


def train(
    env_factory: Callable[[], Environment],
    *,
    hyperparams: dict[str, Any],
    on_metric: Callable[[dict[str, Any]], None],
    should_stop: Callable[[], bool],
    checkpoint_path: Path,
    env_spec: EnvSpec | None = None,
) -> dict[str, Any]:
    import torch
    import torch.nn.functional as F

    seed = int(hyperparams["seed"])
    torch.manual_seed(seed)
    rng = random.Random(seed)
    device = torch_device()
    obs_dim, num_actions = infer_dims(env_factory, env_spec)
    hidden = int(hyperparams["hidden"])

    policy_net = QNetwork.build(obs_dim, num_actions, hidden).to(device)
    target_net = QNetwork.build(obs_dim, num_actions, hidden).to(device)
    target_net.load_state_dict(policy_net.state_dict())
    optimizer = torch.optim.Adam(policy_net.parameters(), lr=float(hyperparams["learning_rate"]))

    buffer: deque[tuple[list[float], int, float, list[float], bool]] = deque(maxlen=int(hyperparams["buffer_size"]))
    batch_size = int(hyperparams["batch_size"])
    gamma = float(hyperparams["gamma"])
    total_steps = int(hyperparams["total_steps"])
    learning_starts = int(hyperparams["learning_starts"])
    train_frequency = int(hyperparams["train_frequency"])
    target_update_interval = int(hyperparams["target_update_interval"])
    max_steps = int(hyperparams["max_steps"])

    env = env_factory()
    obs = env.reset(seed=seed)
    ep_reward = 0.0
    ep_len = 0
    reward_window: list[float] = []
    best_mean = float("-inf")
    episodes_done = 0

    for global_step in range(1, total_steps + 1):
        if should_stop():
            break
        eps = _epsilon(
            global_step,
            total_steps,
            float(hyperparams["epsilon_start"]),
            float(hyperparams["epsilon_end"]),
            float(hyperparams["exploration_fraction"]),
        )
        if rng.random() < eps:
            action = rng.randrange(num_actions)
        else:
            with torch.no_grad():
                q = policy_net(torch.tensor([obs], dtype=torch.float32, device=device))
                action = int(q.argmax(dim=1).item())

        next_obs, reward, terminated, truncated, _ = env.step(action)
        done = terminated or truncated
        buffer.append((obs, action, float(reward), next_obs, terminated))
        obs = next_obs
        ep_reward += reward
        ep_len += 1

        if done or ep_len >= max_steps:
            episodes_done += 1
            reward_window.append(ep_reward)
            if len(reward_window) > 50:
                reward_window.pop(0)
            mean_reward = sum(reward_window) / len(reward_window)
            best_mean = max(best_mean, mean_reward)
            on_metric(
                {
                    "episode": episodes_done,
                    "global_step": global_step,
                    "epsilon": round(eps, 4),
                    "episode_return": round(ep_reward, 4),
                    "mean_return": round(mean_reward, 4),
                    "episode_length": ep_len,
                }
            )
            obs = env.reset(seed=seed + episodes_done)
            ep_reward = 0.0
            ep_len = 0

        if global_step > learning_starts and len(buffer) >= batch_size and global_step % train_frequency == 0:
            batch = rng.sample(buffer, batch_size)
            states, actions, rewards, next_states, dones = zip(*batch)
            state_t = torch.tensor(states, dtype=torch.float32, device=device)
            action_t = torch.tensor(actions, dtype=torch.long, device=device)
            reward_t = torch.tensor(rewards, dtype=torch.float32, device=device)
            next_t = torch.tensor(next_states, dtype=torch.float32, device=device)
            done_t = torch.tensor(dones, dtype=torch.bool, device=device)

            current = policy_net(state_t).gather(1, action_t.unsqueeze(1)).squeeze(1)
            with torch.no_grad():
                next_q = target_net(next_t).max(dim=1).values
                target = reward_t + gamma * next_q * (~done_t)
            loss = F.mse_loss(current, target)
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()

        if global_step % target_update_interval == 0:
            target_net.load_state_dict(policy_net.state_dict())

    save_qnet(checkpoint_path, policy_net, obs_dim=obs_dim, num_actions=num_actions, hidden=hidden)
    policy = GreedyQPolicy(policy_net, device)
    evaluation = evaluate_policy(env_factory, policy, episodes=20)
    return {
        "algorithm": "dqn",
        "episodes_completed": episodes_done,
        "best_mean_return": round(best_mean, 4) if episodes_done else None,
        "checkpoint_path": str(checkpoint_path),
        "evaluation": evaluation,
    }


def load(checkpoint_path: Path, *, env_spec: EnvSpec | None = None) -> Policy:
    return load_qnet(checkpoint_path)


register_algorithm(
    AlgorithmSpec(
        id="dqn",
        label="DQN",
        description="Deep Q-Network with replay and a target net. Value-based, off-policy; strong on discrete-action tasks.",
        family="value",
        needs_torch=True,
        default_hyperparams=DEFAULTS,
        source="Mnih et al. 2015; CleanRL",
        tags=("value", "off-policy", "replay"),
        train_fn=train,
        load_fn=load,
    )
)
