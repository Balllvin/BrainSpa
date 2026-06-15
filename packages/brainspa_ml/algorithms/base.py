from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Protocol, runtime_checkable

from ..environments import Environment, EnvSpec


@runtime_checkable
class Policy(Protocol):
    """A trained policy that maps an observation to a discrete action."""

    def act(self, observation: list[float], *, env: Environment | None = None) -> int:
        ...


@dataclass(frozen=True)
class AlgorithmSpec:
    """Registry metadata describing one training algorithm."""

    id: str
    label: str
    description: str
    family: str  # "tabular" | "value" | "policy"
    needs_torch: bool
    default_hyperparams: dict[str, Any]
    source: str = ""
    tags: tuple[str, ...] = ()
    train_fn: Callable[..., dict[str, Any]] | None = field(default=None, compare=False)
    load_fn: Callable[..., Policy] | None = field(default=None, compare=False)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "label": self.label,
            "description": self.description,
            "family": self.family,
            "needs_torch": self.needs_torch,
            "default_hyperparams": self.default_hyperparams,
            "source": self.source,
            "tags": list(self.tags),
            "available": (not self.needs_torch) or _torch_available(),
        }


_REGISTRY: dict[str, AlgorithmSpec] = {}


def register_algorithm(spec: AlgorithmSpec) -> AlgorithmSpec:
    _REGISTRY[spec.id] = spec
    return spec


def get_algorithm(algo_id: str) -> AlgorithmSpec:
    if algo_id not in _REGISTRY:
        raise KeyError(f"Unknown algorithm '{algo_id}'. Known: {sorted(_REGISTRY)}")
    return _REGISTRY[algo_id]


def list_algorithm_specs() -> list[AlgorithmSpec]:
    return sorted(_REGISTRY.values(), key=lambda spec: spec.id)


def train_algorithm(
    algo_id: str,
    env_factory: Callable[[], Environment],
    *,
    hyperparams: dict[str, Any] | None = None,
    on_metric: Callable[[dict[str, Any]], None] | None = None,
    should_stop: Callable[[], bool] | None = None,
    checkpoint_path: Path,
    env_spec: EnvSpec | None = None,
) -> dict[str, Any]:
    spec = get_algorithm(algo_id)
    if spec.train_fn is None:
        raise RuntimeError(f"Algorithm '{algo_id}' has no training function")
    merged = {**spec.default_hyperparams, **(hyperparams or {})}
    return spec.train_fn(
        env_factory,
        hyperparams=merged,
        on_metric=on_metric or (lambda _record: None),
        should_stop=should_stop or (lambda: False),
        checkpoint_path=checkpoint_path,
        env_spec=env_spec,
    )


def load_policy(algo_id: str, checkpoint_path: Path, *, env_spec: EnvSpec | None = None) -> Policy:
    spec = get_algorithm(algo_id)
    if spec.load_fn is None:
        raise RuntimeError(f"Algorithm '{algo_id}' has no load function")
    return spec.load_fn(checkpoint_path, env_spec=env_spec)


def rollout_episode(
    env: Environment,
    policy: Policy,
    *,
    seed: int | None = None,
    max_steps: int = 2000,
    capture_frames: bool = False,
) -> dict[str, Any]:
    """Run one greedy episode; return totals and optional render frames."""

    obs = env.reset(seed=seed)
    total_reward = 0.0
    steps = 0
    info: dict[str, Any] = {}
    frames: list[dict[str, Any]] = []
    if capture_frames:
        frames.append(_safe_render(env))
    for _ in range(max_steps):
        action = policy.act(obs, env=env)
        obs, reward, terminated, truncated, info = env.step(action)
        total_reward += reward
        steps += 1
        if capture_frames:
            frame = _safe_render(env)
            frame["action"] = action
            frame["reward"] = reward
            frames.append(frame)
        if terminated or truncated:
            break
    result = {"total_reward": total_reward, "steps": steps, "info": info}
    if capture_frames:
        result["frames"] = frames
    return result


def evaluate_policy(
    env_factory: Callable[[], Environment],
    policy: Policy,
    *,
    episodes: int = 10,
    seed: int = 1234,
) -> dict[str, Any]:
    returns: list[float] = []
    lengths: list[int] = []
    for i in range(episodes):
        env = env_factory()
        out = rollout_episode(env, policy, seed=seed + i)
        returns.append(out["total_reward"])
        lengths.append(out["steps"])
    n = max(len(returns), 1)
    mean_return = sum(returns) / n
    return {
        "episodes": episodes,
        "mean_return": mean_return,
        "max_return": max(returns) if returns else 0.0,
        "min_return": min(returns) if returns else 0.0,
        "mean_length": sum(lengths) / n,
    }


def _safe_render(env: Environment) -> dict[str, Any]:
    try:
        return dict(env.render_state())
    except Exception:  # noqa: BLE001
        return {}


def _torch_available() -> bool:
    try:
        import torch  # noqa: F401

        return True
    except Exception:  # noqa: BLE001
        return False
