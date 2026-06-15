"""Proximal Policy Optimization (PPO) with Generalized Advantage Estimation.

A compact, single-environment port of CleanRL's ``ppo.py`` for discrete action
spaces: collect a fixed-length rollout, compute GAE(lambda) advantages, then do
several epochs of minibatch updates with the clipped surrogate objective.

References: Schulman et al. PPO (2017) and GAE (2016); CleanRL ppo.py.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Callable

from ..environments import Environment, EnvSpec
from .base import AlgorithmSpec, Policy, evaluate_policy, register_algorithm
from .torch_nets import ActorCritic, GreedyActorCriticPolicy, infer_dims, load_actor_critic, save_actor_critic, torch_device

DEFAULTS: dict[str, Any] = {
    "total_steps": 60000,
    "rollout_steps": 1024,
    "update_epochs": 4,
    "minibatch_size": 256,
    "gamma": 0.99,
    "gae_lambda": 0.95,
    "clip_coef": 0.2,
    "entropy_coef": 0.01,
    "value_coef": 0.5,
    "learning_rate": 0.0025,
    "max_grad_norm": 0.5,
    "hidden": 64,
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

    seed = int(hyperparams["seed"])
    torch.manual_seed(seed)
    device = torch_device()
    obs_dim, num_actions = infer_dims(env_factory, env_spec)
    hidden = int(hyperparams["hidden"])
    net = ActorCritic.build(obs_dim, num_actions, hidden).to(device)
    optimizer = torch.optim.Adam(net.parameters(), lr=float(hyperparams["learning_rate"]), eps=1e-5)

    rollout_steps = int(hyperparams["rollout_steps"])
    update_epochs = int(hyperparams["update_epochs"])
    minibatch_size = int(hyperparams["minibatch_size"])
    gamma = float(hyperparams["gamma"])
    gae_lambda = float(hyperparams["gae_lambda"])
    clip_coef = float(hyperparams["clip_coef"])
    entropy_coef = float(hyperparams["entropy_coef"])
    value_coef = float(hyperparams["value_coef"])
    max_grad_norm = float(hyperparams["max_grad_norm"])
    total_steps = int(hyperparams["total_steps"])

    env = env_factory()
    obs = env.reset(seed=seed)
    ep_reward = 0.0
    ep_len = 0
    reward_window: list[float] = []
    best_mean = float("-inf")
    episodes_done = 0
    global_step = 0

    while global_step < total_steps and not should_stop():
        obs_buf: list[list[float]] = []
        act_buf: list[int] = []
        logp_buf: list[float] = []
        rew_buf: list[float] = []
        done_buf: list[float] = []
        val_buf: list[float] = []

        for _ in range(rollout_steps):
            global_step += 1
            tensor = torch.tensor([obs], dtype=torch.float32, device=device)
            with torch.no_grad():
                logits, value = net(tensor)
                dist = torch.distributions.Categorical(logits=logits)
                action = dist.sample()
                logp = dist.log_prob(action)
            obs_buf.append(obs)
            act_buf.append(int(action.item()))
            logp_buf.append(float(logp.item()))
            val_buf.append(float(value.item()))

            obs, reward, terminated, truncated, _ = env.step(int(action.item()))
            done = terminated or truncated
            rew_buf.append(float(reward))
            done_buf.append(1.0 if done else 0.0)
            ep_reward += reward
            ep_len += 1

            if done:
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
                        "episode_return": round(ep_reward, 4),
                        "mean_return": round(mean_reward, 4),
                        "episode_length": ep_len,
                    }
                )
                obs = env.reset(seed=seed + episodes_done)
                ep_reward = 0.0
                ep_len = 0

        # Bootstrap value for the final state.
        with torch.no_grad():
            _, last_value = net(torch.tensor([obs], dtype=torch.float32, device=device))
        last_value = float(last_value.item())

        # GAE(lambda).
        advantages = [0.0] * len(rew_buf)
        last_gae = 0.0
        for t in reversed(range(len(rew_buf))):
            next_value = last_value if t == len(rew_buf) - 1 else val_buf[t + 1]
            next_nonterminal = 1.0 - done_buf[t]
            delta = rew_buf[t] + gamma * next_value * next_nonterminal - val_buf[t]
            last_gae = delta + gamma * gae_lambda * next_nonterminal * last_gae
            advantages[t] = last_gae
        returns = [advantages[i] + val_buf[i] for i in range(len(advantages))]

        b_obs = torch.tensor(obs_buf, dtype=torch.float32, device=device)
        b_act = torch.tensor(act_buf, dtype=torch.long, device=device)
        b_logp = torch.tensor(logp_buf, dtype=torch.float32, device=device)
        b_adv = torch.tensor(advantages, dtype=torch.float32, device=device)
        b_ret = torch.tensor(returns, dtype=torch.float32, device=device)
        b_adv = (b_adv - b_adv.mean()) / (b_adv.std() + 1e-8)

        n = b_obs.shape[0]
        indices = list(range(n))
        for _epoch in range(update_epochs):
            torch.manual_seed(seed + global_step + _epoch)
            perm = torch.randperm(n, device=device)
            for start in range(0, n, minibatch_size):
                mb = perm[start : start + minibatch_size]
                logits, values = net(b_obs[mb])
                dist = torch.distributions.Categorical(logits=logits)
                new_logp = dist.log_prob(b_act[mb])
                entropy = dist.entropy().mean()
                ratio = (new_logp - b_logp[mb]).exp()
                mb_adv = b_adv[mb]
                surr1 = ratio * mb_adv
                surr2 = torch.clamp(ratio, 1.0 - clip_coef, 1.0 + clip_coef) * mb_adv
                policy_loss = -torch.min(surr1, surr2).mean()
                value_loss = F.mse_loss(values.squeeze(-1), b_ret[mb])
                loss = policy_loss + value_coef * value_loss - entropy_coef * entropy
                optimizer.zero_grad()
                loss.backward()
                torch.nn.utils.clip_grad_norm_(net.parameters(), max_grad_norm)
                optimizer.step()

    save_actor_critic(checkpoint_path, net, obs_dim=obs_dim, num_actions=num_actions, hidden=hidden)
    policy = GreedyActorCriticPolicy(net, device)
    evaluation = evaluate_policy(env_factory, policy, episodes=20)
    return {
        "algorithm": "ppo",
        "episodes_completed": episodes_done,
        "global_steps": global_step,
        "best_mean_return": round(best_mean, 4) if episodes_done else None,
        "checkpoint_path": str(checkpoint_path),
        "evaluation": evaluation,
    }


def load(checkpoint_path: Path, *, env_spec: EnvSpec | None = None) -> Policy:
    return load_actor_critic(checkpoint_path)


register_algorithm(
    AlgorithmSpec(
        id="ppo",
        label="PPO (GAE)",
        description="Proximal Policy Optimization with GAE and a clipped objective. The robust default for most control tasks.",
        family="policy",
        needs_torch=True,
        default_hyperparams=DEFAULTS,
        source="Schulman et al. 2017/2016; CleanRL",
        tags=("policy-gradient", "on-policy", "gae", "clip"),
        train_fn=train,
        load_fn=load,
    )
)
