from __future__ import annotations

import json
from typing import Any

from .config import model_feedback_path


def append_model_feedback_record(payload: dict[str, Any]) -> str:
    feedback_file = model_feedback_path()
    feedback_file.parent.mkdir(parents=True, exist_ok=True)
    with feedback_file.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, sort_keys=True) + "\n")
    return str(feedback_file)
