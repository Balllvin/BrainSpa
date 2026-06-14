from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Discrete:
    """A finite set of integer actions ``0 .. n-1``."""

    n: int

    def to_dict(self) -> dict[str, object]:
        return {"kind": "discrete", "n": self.n}


@dataclass(frozen=True)
class Box:
    """A continuous observation vector of fixed length.

    ``low``/``high`` are advisory bounds used for display and normalization
    hints only; environments are responsible for staying inside them.
    """

    dim: int
    low: float = -1.0
    high: float = 1.0

    def to_dict(self) -> dict[str, object]:
        return {"kind": "box", "dim": self.dim, "low": self.low, "high": self.high}
