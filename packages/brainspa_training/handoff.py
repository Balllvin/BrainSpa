from __future__ import annotations

from pathlib import Path


REQUIRED_HANDOFF_KEYS = {"export_kind", "schema_version", "project_key", "dataset_key", "preferred_model", "train_path"}


def validate_handoff(payload: dict[str, object]) -> list[str]:
    missing = sorted(REQUIRED_HANDOFF_KEYS.difference(payload))
    warnings = [f"Missing handoff key: {key}" for key in missing]
    train_path = payload.get("train_path")
    if isinstance(train_path, str) and not Path(train_path).exists():
        warnings.append("Training data path does not exist.")
    return warnings

