from __future__ import annotations

from dataclasses import dataclass, field

from .sim import SnakeState


def manhattan(a: tuple[int, int], b: tuple[int, int]) -> int:
    return abs(a[0] - b[0]) + abs(a[1] - b[1])


@dataclass
class RewardBreakdown:
    apple: float = 0.0
    death_wall: float = 0.0
    death_self: float = 0.0
    survival: float = 0.0
    distance_to_apple_delta: float = 0.0
    coverage_bonus: float = 0.0
    length: float = 0.0
    board_coverage: float = 0.0
    total: float = 0.0

    def to_dict(self) -> dict[str, float]:
        return {
            "apple": self.apple,
            "death_wall": self.death_wall,
            "death_self": self.death_self,
            "survival": self.survival,
            "distance_to_apple_delta": self.distance_to_apple_delta,
            "coverage_bonus": self.coverage_bonus,
            "length": self.length,
            "board_coverage": self.board_coverage,
            "total": self.total,
        }


class RewardDecomposer:
    def __init__(
        self,
        *,
        apple_reward: float = 10.0,
        death_penalty: float = -10.0,
        survival_reward: float = 0.01,
        distance_scale: float = 0.1,
        coverage_scale: float = 0.05,
        curriculum_stage: str = "A",
    ) -> None:
        self.apple_reward = apple_reward
        self.death_penalty = death_penalty
        self.survival_reward = survival_reward
        self.distance_scale = distance_scale
        self.coverage_scale = coverage_scale
        self.curriculum_stage = curriculum_stage
        self._prev_distance: int | None = None

    def reset(self, state: SnakeState) -> RewardBreakdown:
        self._prev_distance = manhattan(state.head, state.apple)
        return RewardBreakdown(
            length=float(state.length),
            board_coverage=state.coverage,
        )

    def step(
        self,
        prev: SnakeState,
        nxt: SnakeState,
        *,
        ate_apple: bool,
    ) -> RewardBreakdown:
        breakdown = RewardBreakdown(
            length=float(nxt.length),
            board_coverage=nxt.coverage,
        )
        breakdown.survival = self.survival_reward

        if ate_apple:
            breakdown.apple = self.apple_reward

        if nxt.done:
            if nxt.outcome == "died_wall":
                breakdown.death_wall = self.death_penalty
            elif nxt.outcome == "died_self":
                breakdown.death_self = self.death_penalty
            elif nxt.outcome == "full_board":
                breakdown.coverage_bonus = 50.0

        current_distance = manhattan(nxt.head, nxt.apple)
        if self._prev_distance is not None and not nxt.done:
            delta = self._prev_distance - current_distance
            breakdown.distance_to_apple_delta = delta * self.distance_scale
        self._prev_distance = current_distance

        if self.curriculum_stage in {"B", "C"}:
            breakdown.coverage_bonus += nxt.coverage * self.coverage_scale

        breakdown.total = sum(
            (
                breakdown.apple,
                breakdown.death_wall,
                breakdown.death_self,
                breakdown.survival,
                breakdown.distance_to_apple_delta,
                breakdown.coverage_bonus,
            )
        )
        return breakdown