from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable, Protocol, runtime_checkable

from .spaces import Box, Discrete

StepResult = tuple[list[float], float, bool, bool, dict[str, Any]]


@runtime_checkable
class Environment(Protocol):
    """A minimal Gym-style environment contract.

    Observations are plain ``list[float]`` (no NumPy requirement) and actions
    are integers. This keeps the contract dependency-free so tabular and
    pure-Python algorithms work without Torch, while neural algorithms can wrap
    the same observations in tensors.
    """

    observation_space: Box
    action_space: Discrete

    def reset(self, *, seed: int | None = None) -> list[float]:
        ...

    def step(self, action: int) -> StepResult:
        ...

    def render_state(self) -> dict[str, Any]:
        """A small JSON-able snapshot for live UI rendering (optional)."""
        ...


@dataclass(frozen=True)
class EnvSpec:
    """Registry metadata describing one trainable environment."""

    id: str
    label: str
    description: str
    obs_dim: int
    num_actions: int
    max_episode_steps: int
    factory: Callable[..., Environment]
    tags: tuple[str, ...] = ()
    reward_threshold: float | None = None
    source: str = ""
    discrete_states: int | None = None  # set for tabular-friendly envs

    def make(self, **kwargs: Any) -> Environment:
        return self.factory(**kwargs)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "label": self.label,
            "description": self.description,
            "obs_dim": self.obs_dim,
            "num_actions": self.num_actions,
            "max_episode_steps": self.max_episode_steps,
            "tags": list(self.tags),
            "reward_threshold": self.reward_threshold,
            "source": self.source,
            "tabular_ready": self.discrete_states is not None,
            "discrete_states": self.discrete_states,
        }


_REGISTRY: dict[str, EnvSpec] = {}


def register_env(spec: EnvSpec) -> EnvSpec:
    _REGISTRY[spec.id] = spec
    return spec


def get_env_spec(env_id: str) -> EnvSpec:
    if env_id not in _REGISTRY:
        _ensure_builtin_envs()
    if env_id not in _REGISTRY:
        raise KeyError(f"Unknown environment '{env_id}'. Known: {sorted(_REGISTRY)}")
    return _REGISTRY[env_id]


def list_env_specs() -> list[EnvSpec]:
    _ensure_builtin_envs()
    return sorted(_REGISTRY.values(), key=lambda spec: spec.id)


def make_env(env_id: str, **kwargs: Any) -> Environment:
    return get_env_spec(env_id).make(**kwargs)


_BUILTINS_LOADED = False


def _ensure_builtin_envs() -> None:
    global _BUILTINS_LOADED
    if _BUILTINS_LOADED:
        return
    _BUILTINS_LOADED = True
    # Importing the modules triggers their register_env(...) calls.
    from .envs import cartpole, gridworld, mountain_car, snake_adapter  # noqa: F401


# Trigger registration on import so callers can use the registry directly.
_ensure_builtin_envs()
