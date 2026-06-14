"""Shared Torch building blocks for the neural algorithms.

Kept deliberately small. Networks follow CleanRL conventions (orthogonal init,
tanh trunks) so behaviour matches widely-studied single-file baselines.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from ..environments import Environment, EnvSpec


def torch_device() -> Any:
    import torch

    return torch.device("cuda" if torch.cuda.is_available() else "cpu")


def _layer_init(layer: Any, std: float = 1.4142135623730951, bias: float = 0.0) -> Any:
    import torch.nn as nn

    nn.init.orthogonal_(layer.weight, std)
    nn.init.constant_(layer.bias, bias)
    return layer


class ActorCritic:
    """Factory for a shared-trunk actor-critic module (built lazily)."""

    @staticmethod
    def build(obs_dim: int, num_actions: int, hidden: int = 64) -> Any:
        import torch.nn as nn

        class _Net(nn.Module):
            def __init__(self) -> None:
                super().__init__()
                self.trunk = nn.Sequential(
                    _layer_init(nn.Linear(obs_dim, hidden)),
                    nn.Tanh(),
                    _layer_init(nn.Linear(hidden, hidden)),
                    nn.Tanh(),
                )
                self.policy_head = _layer_init(nn.Linear(hidden, num_actions), std=0.01)
                self.value_head = _layer_init(nn.Linear(hidden, 1), std=1.0)

            def forward(self, x: Any) -> Any:
                z = self.trunk(x)
                return self.policy_head(z), self.value_head(z)

        return _Net()


class QNetwork:
    @staticmethod
    def build(obs_dim: int, num_actions: int, hidden: int = 128) -> Any:
        import torch.nn as nn

        class _QNet(nn.Module):
            def __init__(self) -> None:
                super().__init__()
                self.net = nn.Sequential(
                    nn.Linear(obs_dim, hidden),
                    nn.ReLU(),
                    nn.Linear(hidden, hidden),
                    nn.ReLU(),
                    nn.Linear(hidden, num_actions),
                )

            def forward(self, x: Any) -> Any:
                return self.net(x)

        return _QNet()


class GreedyActorCriticPolicy:
    def __init__(self, net: Any, device: Any) -> None:
        self._net = net
        self._device = device

    def act(self, observation: list[float], *, env: Environment | None = None) -> int:
        import torch

        self._net.train(False)  # inference mode (equivalent to .eval())
        with torch.no_grad():
            tensor = torch.tensor([observation], dtype=torch.float32, device=self._device)
            logits, _ = self._net(tensor)
            return int(logits.argmax(dim=1).item())


class GreedyQPolicy:
    def __init__(self, net: Any, device: Any) -> None:
        self._net = net
        self._device = device

    def act(self, observation: list[float], *, env: Environment | None = None) -> int:
        import torch

        self._net.train(False)  # inference mode (equivalent to .eval())
        with torch.no_grad():
            tensor = torch.tensor([observation], dtype=torch.float32, device=self._device)
            q = self._net(tensor)
            return int(q.argmax(dim=1).item())


def save_actor_critic(path: Path, net: Any, *, obs_dim: int, num_actions: int, hidden: int) -> None:
    import torch

    path.parent.mkdir(parents=True, exist_ok=True)
    torch.save(
        {"state_dict": net.state_dict(), "obs_dim": obs_dim, "num_actions": num_actions, "hidden": hidden, "head": "actor_critic"},
        path,
    )


def load_actor_critic(path: Path) -> GreedyActorCriticPolicy:
    import torch

    device = torch_device()
    payload = torch.load(path, map_location=device, weights_only=False)
    net = ActorCritic.build(payload["obs_dim"], payload["num_actions"], payload.get("hidden", 64)).to(device)
    net.load_state_dict(payload["state_dict"])
    return GreedyActorCriticPolicy(net, device)


def save_qnet(path: Path, net: Any, *, obs_dim: int, num_actions: int, hidden: int) -> None:
    import torch

    path.parent.mkdir(parents=True, exist_ok=True)
    torch.save(
        {"state_dict": net.state_dict(), "obs_dim": obs_dim, "num_actions": num_actions, "hidden": hidden, "head": "qnet"},
        path,
    )


def load_qnet(path: Path) -> GreedyQPolicy:
    import torch

    device = torch_device()
    payload = torch.load(path, map_location=device, weights_only=False)
    net = QNetwork.build(payload["obs_dim"], payload["num_actions"], payload.get("hidden", 128)).to(device)
    net.load_state_dict(payload["state_dict"])
    return GreedyQPolicy(net, device)


def infer_dims(env_factory: Any, env_spec: EnvSpec | None) -> tuple[int, int]:
    if env_spec is not None:
        return env_spec.obs_dim, env_spec.num_actions
    probe = env_factory()
    return probe.observation_space.dim, probe.action_space.n
