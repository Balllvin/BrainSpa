"""REINFORCE with a learned value baseline (Monte-Carlo policy gradient).

The simplest neural policy-gradient method: roll out full episodes, compute
discounted returns, subtract a value baseline to cut variance, and take one
gradient step per batch.

Reference: Williams (1992); OpenAI Spinning Up "Intro to Policy Optimization".
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Callable

from ..environments import Environment, EnvSpec
from .base import AlgorithmSpec, Policy, evaluate_policy, register_algorithm
from .torch_nets import ActorCritic, GreedyActorCriticPolicy, infer_dims, load_actor_critic, save_actor_critic, torch_device

DEFAULTS: dict[str, Any] = {
    "episodes": 600,
    "gamma": 0.99,
    "learning_rate": 0.0025,
    "hidden": 64,
    "entropy_coef": 0.01,
    "value_coef": 0.5,
    "batch_episodes": 8,
    "max_steps": 500,
    "seed": 0,
}


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

    torch.manual_seed(int(hyperparams["seed"]))
    device = torch_device()
    obs_dim, num_actions = infer_dims(env_factory, env_spec)
    hidden = int(hyperparams["hidden"])
    net = ActorCritic.build(obs_dim, num_actions, hidden).to(device)
    optimizer = torch.optim.Adam(net.parameters(), lr=float(hyperparams["learning_rate"]))

    gamma = float(hyperparams["gamma"])
    entropy_coef = float(hyperparams["entropy_coef"])
    value_coef = float(hyperparams["value_coef"])
    batch_episodes = max(1, int(hyperparams["batch_episodes"]))
    max_steps = int(hyperparams["max_steps"])
    total_episodes = int(hyperparams["episodes"])

    reward_window: list[float] = []
    best_mean = float("-inf")
    episodes_done = 0

    while episodes_done < total_episodes and not should_stop():
        batch_logps: list[Any] = []
        batch_returns: list[float] = []
        batch_values: list[Any] = []
        batch_entropies: list[Any] = []

        for _ in range(batch_episodes):
            if episodes_done >= total_episodes:
                break
            env = env_factory()
            obs = env.reset(seed=int(hyperparams["seed"]) + episodes_done)
            ep_logps: list[Any] = []
            ep_values: list[Any] = []
            ep_rewards: list[float] = []
            ep_entropy: list[Any] = []
            total_reward = 0.0
            for _step in range(max_steps):
                tensor = torch.tensor([obs], dtype=torch.float32, device=device)
                logits, value = net(tensor)
                dist = torch.distributions.Categorical(logits=logits)
                action = dist.sample()
                # Squeeze to 0-dim scalars so the stacked batch tensors are 1-D
                # ([N]); otherwise [N,1] would broadcast against [N] returns.
                ep_logps.append(dist.log_prob(action).squeeze())
                ep_entropy.append(dist.entropy().squeeze())
                ep_values.append(value.squeeze())
                obs, reward, terminated, truncated, _ = env.step(int(action.item()))
                ep_rewards.append(reward)
                total_reward += reward
                if terminated or truncated:
                    break

            # Discounted returns.
            returns: list[float] = []
            running = 0.0
            for r in reversed(ep_rewards):
                running = r + gamma * running
                returns.insert(0, running)
            batch_logps.extend(ep_logps)
            batch_values.extend(ep_values)
            batch_entropies.extend(ep_entropy)
            batch_returns.extend(returns)

            episodes_done += 1
            reward_window.append(total_reward)
            if len(reward_window) > 50:
                reward_window.pop(0)
            mean_reward = sum(reward_window) / len(reward_window)
            best_mean = max(best_mean, mean_reward)
            on_metric(
                {
                    "episode": episodes_done,
                    "episode_return": round(total_reward, 4),
                    "mean_return": round(mean_reward, 4),
                    "episode_length": len(ep_rewards),
                }
            )

        if not batch_returns:
            break

        logps_t = torch.stack(batch_logps)
        values_t = torch.stack(batch_values)
        entropy_t = torch.stack(batch_entropies).mean()
        returns_t = torch.tensor(batch_returns, dtype=torch.float32, device=device)
        # Normalize returns for stability.
        if returns_t.numel() > 1:
            returns_t = (returns_t - returns_t.mean()) / (returns_t.std() + 1e-8)
        advantages = returns_t - values_t.detach()

        policy_loss = -(logps_t * advantages).mean()
        value_loss = F.mse_loss(values_t, returns_t)
        loss = policy_loss + value_coef * value_loss - entropy_coef * entropy_t

        optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(net.parameters(), 0.5)
        optimizer.step()

    save_actor_critic(checkpoint_path, net, obs_dim=obs_dim, num_actions=num_actions, hidden=hidden)
    policy = GreedyActorCriticPolicy(net, device)
    evaluation = evaluate_policy(env_factory, policy, episodes=20)
    return {
        "algorithm": "reinforce",
        "episodes_completed": episodes_done,
        "best_mean_return": round(best_mean, 4) if episodes_done else None,
        "checkpoint_path": str(checkpoint_path),
        "evaluation": evaluation,
    }


def load(checkpoint_path: Path, *, env_spec: EnvSpec | None = None) -> Policy:
    return load_actor_critic(checkpoint_path)


register_algorithm(
    AlgorithmSpec(
        id="reinforce",
        label="REINFORCE (+ baseline)",
        description="Monte-Carlo policy gradient with a value baseline. Simple, readable, good for CartPole and small tasks.",
        family="policy",
        needs_torch=True,
        default_hyperparams=DEFAULTS,
        source="Williams 1992; OpenAI Spinning Up",
        tags=("policy-gradient", "on-policy", "actor-critic"),
        train_fn=train,
        load_fn=load,
    )
)
