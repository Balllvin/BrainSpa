from __future__ import annotations


def is_fen_like(value: str) -> bool:
    return "/" in value and " " in value

