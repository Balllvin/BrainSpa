"""Tabular dataset ingest, profiling, splitting, and built-in toy datasets.

Parses CSV/JSONL into row dicts, infers a simple schema (numeric vs.
categorical), profiles each column, and stores everything under
``~/.brain-spa/artifacts/ml/datasets/<id>``. Built-in generators let a user
train something immediately without uploading a file.
"""

from __future__ import annotations

import csv
import io
import json
import math
import random
import re
import time
from pathlib import Path
from typing import Any

from .paths import datasets_dir, read_json, write_json

Row = dict[str, Any]


def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.strip().lower()).strip("-")
    return slug or "dataset"


def _unique_id(name: str) -> str:
    base = _slugify(name)
    root = datasets_dir()
    candidate = base
    i = 2
    while (root / candidate).exists():
        candidate = f"{base}-{i}"
        i += 1
    return candidate


def parse_rows(content: str, fmt: str) -> list[Row]:
    fmt = fmt.lower()
    if fmt == "jsonl":
        rows: list[Row] = []
        for line in content.splitlines():
            line = line.strip()
            if not line:
                continue
            obj = json.loads(line)
            if isinstance(obj, dict):
                rows.append(obj)
        return rows
    if fmt == "json":
        obj = json.loads(content)
        if isinstance(obj, list):
            return [r for r in obj if isinstance(r, dict)]
        raise ValueError("JSON dataset must be a list of objects.")
    # default: csv
    reader = csv.DictReader(io.StringIO(content))
    return [dict(r) for r in reader]


def _is_number(value: Any) -> bool:
    if isinstance(value, bool):
        return False
    if isinstance(value, (int, float)):
        return True
    if value is None:
        return False
    try:
        float(str(value))
        return True
    except (TypeError, ValueError):
        return False


def profile_columns(rows: list[Row]) -> list[dict[str, Any]]:
    if not rows:
        return []
    columns: list[str] = []
    for row in rows:
        for key in row:
            if key not in columns:
                columns.append(key)
    profiles: list[dict[str, Any]] = []
    for col in columns:
        values = [row.get(col) for row in rows]
        present = [v for v in values if v not in (None, "")]
        numeric_vals = [float(v) for v in present if _is_number(v)]
        is_numeric = len(present) > 0 and len(numeric_vals) == len(present)
        profile: dict[str, Any] = {
            "name": col,
            "dtype": "numeric" if is_numeric else "categorical",
            "missing": len(values) - len(present),
            "count": len(values),
        }
        if is_numeric and numeric_vals:
            mean = sum(numeric_vals) / len(numeric_vals)
            variance = sum((x - mean) ** 2 for x in numeric_vals) / len(numeric_vals)
            profile.update(
                {
                    "min": round(min(numeric_vals), 4),
                    "max": round(max(numeric_vals), 4),
                    "mean": round(mean, 4),
                    "std": round(math.sqrt(variance), 4),
                }
            )
        else:
            uniques = sorted({str(v) for v in present})
            profile.update(
                {
                    "unique": len(uniques),
                    "top_values": uniques[:12],
                }
            )
        profiles.append(profile)
    return profiles


def ingest_tabular(name: str, content: str, fmt: str = "csv", *, source: str = "upload") -> dict[str, Any]:
    rows = parse_rows(content, fmt)
    if not rows:
        raise ValueError("No rows parsed from the dataset content.")
    dataset_id = _unique_id(name)
    folder = datasets_dir() / dataset_id
    folder.mkdir(parents=True, exist_ok=True)
    with (folder / "data.jsonl").open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row) + "\n")
    columns = profile_columns(rows)
    meta = {
        "id": dataset_id,
        "name": name,
        "format": fmt,
        "source": source,
        "row_count": len(rows),
        "columns": columns,
        "created_at": time.time(),
    }
    write_json(folder / "meta.json", meta)
    return meta


def list_datasets() -> list[dict[str, Any]]:
    root = datasets_dir()
    if not root.exists():
        return []
    out: list[dict[str, Any]] = []
    for folder in sorted(root.iterdir()):
        meta = read_json(folder / "meta.json")
        if meta:
            out.append(meta)
    return sorted(out, key=lambda m: m.get("created_at", 0), reverse=True)


def get_dataset_meta(dataset_id: str) -> dict[str, Any] | None:
    return read_json(datasets_dir() / dataset_id / "meta.json")


def load_rows(dataset_id: str) -> list[Row]:
    path = datasets_dir() / dataset_id / "data.jsonl"
    rows: list[Row] = []
    if not path.exists():
        return rows
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line:
            rows.append(json.loads(line))
    return rows


def sample_rows(dataset_id: str, limit: int = 12) -> list[Row]:
    rows = load_rows(dataset_id)
    return rows[:limit]


def delete_dataset(dataset_id: str) -> bool:
    folder = datasets_dir() / dataset_id
    if not folder.exists():
        return False
    for child in folder.iterdir():
        child.unlink()
    folder.rmdir()
    return True


def split_indices(n: int, *, train: float = 0.7, val: float = 0.15, seed: int = 0) -> dict[str, list[int]]:
    rng = random.Random(seed)
    idx = list(range(n))
    rng.shuffle(idx)
    n_train = int(n * train)
    n_val = int(n * val)
    return {
        "train": idx[:n_train],
        "val": idx[n_train : n_train + n_val],
        "test": idx[n_train + n_val :],
    }


# --- Built-in toy datasets -------------------------------------------------

BUILTIN_DATASETS = {
    "blobs": "3-class Gaussian blobs (classification) with 2 numeric features.",
    "moons": "Two interleaving half-moons (classification) — nonlinear, needs an MLP.",
    "linear": "Noisy linear relationship (regression) with 2 numeric features.",
}


def generate_builtin(name: str, *, n: int = 300, seed: int = 0) -> tuple[str, str]:
    """Return (display_name, jsonl_content) for a built-in toy dataset."""

    rng = random.Random(seed)
    rows: list[Row] = []
    if name == "blobs":
        centers = [(-2.0, -2.0), (2.0, -2.0), (0.0, 2.5)]
        for _ in range(n):
            cls = rng.randrange(len(centers))
            cx, cy = centers[cls]
            rows.append({"x1": round(cx + rng.gauss(0, 0.8), 4), "x2": round(cy + rng.gauss(0, 0.8), 4), "label": f"class_{cls}"})
        return "Toy blobs", _to_jsonl(rows)
    if name == "moons":
        for _ in range(n):
            if rng.random() < 0.5:
                t = math.pi * rng.random()
                rows.append({"x1": round(math.cos(t) + rng.gauss(0, 0.1), 4), "x2": round(math.sin(t) + rng.gauss(0, 0.1), 4), "label": "upper"})
            else:
                t = math.pi * rng.random()
                rows.append({"x1": round(1 - math.cos(t) + rng.gauss(0, 0.1), 4), "x2": round(0.5 - math.sin(t) + rng.gauss(0, 0.1), 4), "label": "lower"})
        return "Toy moons", _to_jsonl(rows)
    if name == "linear":
        for _ in range(n):
            x1 = rng.uniform(-3, 3)
            x2 = rng.uniform(-3, 3)
            y = 2.0 * x1 - 1.5 * x2 + 0.5 + rng.gauss(0, 0.4)
            rows.append({"x1": round(x1, 4), "x2": round(x2, 4), "target": round(y, 4)})
        return "Toy linear", _to_jsonl(rows)
    raise ValueError(f"Unknown built-in dataset '{name}'. Known: {sorted(BUILTIN_DATASETS)}")


def _to_jsonl(rows: list[Row]) -> str:
    return "\n".join(json.dumps(r) for r in rows) + "\n"
