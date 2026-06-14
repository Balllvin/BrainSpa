"""Supervised learning over tabular data — the non-RL half of the platform.

Featurizes row dicts into numeric vectors (standardized numeric columns +
one-hot categoricals), then trains either pure-Python models (softmax logistic
regression, linear regression — zero dependencies) or a Torch MLP. Reports
proper held-out metrics and supports single-row inference.
"""

from __future__ import annotations

import json
import math
import random
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

from . import datasets as ds

Row = dict[str, Any]


# --- Featurization ---------------------------------------------------------


def infer_task(rows: list[Row], target: str) -> str:
    values = [r.get(target) for r in rows if r.get(target) not in (None, "")]
    if not values:
        raise ValueError(f"Target column '{target}' has no values.")
    numeric = all(ds._is_number(v) for v in values)
    distinct = len({str(v) for v in values})
    # Numeric target with many distinct values => regression, else classification.
    if numeric and distinct > max(15, len(values) // 20):
        return "regression"
    return "classification"


def build_encoder(
    rows: list[Row],
    feature_cols: list[str],
    target: str,
    task: str,
    *,
    class_rows: list[Row] | None = None,
) -> dict[str, Any]:
    features: list[dict[str, Any]] = []
    for col in feature_cols:
        present = [r.get(col) for r in rows if r.get(col) not in (None, "")]
        numeric = len(present) > 0 and all(ds._is_number(v) for v in present)
        if numeric:
            vals = [float(v) for v in present]
            mean = sum(vals) / len(vals)
            var = sum((x - mean) ** 2 for x in vals) / len(vals)
            features.append({"name": col, "dtype": "numeric", "mean": mean, "std": math.sqrt(var) or 1.0})
        else:
            vocab = sorted({str(v) for v in present})
            features.append({"name": col, "dtype": "categorical", "vocab": vocab})
    encoder: dict[str, Any] = {"features": features, "target": target, "task": task}
    if task == "classification":
        label_rows = class_rows or rows
        encoder["classes"] = sorted({str(r.get(target)) for r in label_rows if r.get(target) not in (None, "")})
    return encoder


def encode_row(row: Row, encoder: dict[str, Any]) -> list[float]:
    vec: list[float] = []
    for feat in encoder["features"]:
        value = row.get(feat["name"])
        if feat["dtype"] == "numeric":
            x = float(value) if ds._is_number(value) else feat["mean"]
            vec.append((x - feat["mean"]) / (feat["std"] or 1.0))
        else:
            vocab = feat["vocab"]
            onehot = [0.0] * len(vocab)
            key = str(value)
            if key in vocab:
                onehot[vocab.index(key)] = 1.0
            vec.extend(onehot)
    return vec


def transform(rows: list[Row], encoder: dict[str, Any]) -> tuple[list[list[float]], list[Any]]:
    X = [encode_row(r, encoder) for r in rows]
    target = encoder["target"]
    if encoder["task"] == "classification":
        classes = encoder["classes"]
        class_index = {label: idx for idx, label in enumerate(classes)}
        y = []
        for row_number, row in enumerate(rows, start=1):
            value = _target_value(row, target, row_number)
            label = str(value)
            if label not in class_index:
                raise ValueError(f"Target column '{target}' has unseen label '{label}' at row {row_number}.")
            y.append(class_index[label])
    else:
        y = []
        for row_number, row in enumerate(rows, start=1):
            value = _target_value(row, target, row_number)
            if not ds._is_number(value):
                raise ValueError(f"Target column '{target}' has non-numeric value at row {row_number}.")
            y.append(float(value))
    return X, y


def feature_width(encoder: dict[str, Any]) -> int:
    width = 0
    for feat in encoder["features"]:
        width += 1 if feat["dtype"] == "numeric" else len(feat["vocab"])
    return width


# --- Metrics ---------------------------------------------------------------


def classification_metrics(y_true: list[int], y_pred: list[int], num_classes: int) -> dict[str, float]:
    n = max(len(y_true), 1)
    correct = sum(1 for a, b in zip(y_true, y_pred) if a == b)
    accuracy = correct / n
    f1s: list[float] = []
    for c in range(num_classes):
        tp = sum(1 for a, b in zip(y_true, y_pred) if a == c and b == c)
        fp = sum(1 for a, b in zip(y_true, y_pred) if a != c and b == c)
        fn = sum(1 for a, b in zip(y_true, y_pred) if a == c and b != c)
        precision = tp / (tp + fp) if (tp + fp) else 0.0
        recall = tp / (tp + fn) if (tp + fn) else 0.0
        f1 = 2 * precision * recall / (precision + recall) if (precision + recall) else 0.0
        f1s.append(f1)
    return {"accuracy": round(accuracy, 4), "macro_f1": round(sum(f1s) / max(len(f1s), 1), 4)}


def regression_metrics(y_true: list[float], y_pred: list[float]) -> dict[str, float]:
    n = max(len(y_true), 1)
    mse = sum((a - b) ** 2 for a, b in zip(y_true, y_pred)) / n
    mae = sum(abs(a - b) for a, b in zip(y_true, y_pred)) / n
    mean_y = sum(y_true) / n
    ss_tot = sum((a - mean_y) ** 2 for a in y_true) or 1e-9
    ss_res = sum((a - b) ** 2 for a, b in zip(y_true, y_pred))
    r2 = 1.0 - ss_res / ss_tot
    return {"mse": round(mse, 4), "mae": round(mae, 4), "r2": round(r2, 4)}


# --- Pure-Python models ----------------------------------------------------


def _softmax(logits: list[float]) -> list[float]:
    m = max(logits)
    exps = [math.exp(z - m) for z in logits]
    s = sum(exps) or 1.0
    return [e / s for e in exps]


def _train_logreg(
    X: list[list[float]],
    y: list[int],
    num_classes: int,
    hyperparams: dict[str, Any],
    on_epoch: Callable[[int, float], None],
    should_stop: Callable[[], bool],
) -> dict[str, Any]:
    d = len(X[0]) if X else 0
    epochs = int(hyperparams.get("epochs", 120))
    lr = float(hyperparams.get("learning_rate", 0.1))
    l2 = float(hyperparams.get("l2", 0.001))
    W = [[0.0] * num_classes for _ in range(d)]
    b = [0.0] * num_classes
    n = len(X)
    for epoch in range(epochs):
        if should_stop():
            break
        gradW = [[0.0] * num_classes for _ in range(d)]
        gradB = [0.0] * num_classes
        loss = 0.0
        for xi, yi in zip(X, y):
            logits = [sum(xi[j] * W[j][k] for j in range(d)) + b[k] for k in range(num_classes)]
            probs = _softmax(logits)
            loss -= math.log(max(probs[yi], 1e-12))
            for k in range(num_classes):
                err = probs[k] - (1.0 if k == yi else 0.0)
                gradB[k] += err
                for j in range(d):
                    gradW[j][k] += err * xi[j]
        for k in range(num_classes):
            b[k] -= lr * (gradB[k] / n)
            for j in range(d):
                W[j][k] -= lr * (gradW[j][k] / n + l2 * W[j][k])
        on_epoch(epoch + 1, loss / max(n, 1))
    return {"kind": "logreg", "W": W, "b": b, "num_classes": num_classes}


def _logreg_predict(params: dict[str, Any], x: list[float]) -> tuple[int, list[float]]:
    W, b = params["W"], params["b"]
    d = len(W)
    num_classes = params["num_classes"]
    logits = [sum(x[j] * W[j][k] for j in range(d)) + b[k] for k in range(num_classes)]
    probs = _softmax(logits)
    return max(range(num_classes), key=lambda k: probs[k]), probs


def _train_linreg(
    X: list[list[float]],
    y: list[float],
    hyperparams: dict[str, Any],
    on_epoch: Callable[[int, float], None],
    should_stop: Callable[[], bool],
) -> dict[str, Any]:
    d = len(X[0]) if X else 0
    epochs = int(hyperparams.get("epochs", 200))
    lr = float(hyperparams.get("learning_rate", 0.05))
    l2 = float(hyperparams.get("l2", 0.001))
    W = [0.0] * d
    b = 0.0
    n = len(X)
    for epoch in range(epochs):
        if should_stop():
            break
        gradW = [0.0] * d
        gradB = 0.0
        loss = 0.0
        for xi, yi in zip(X, y):
            pred = sum(xi[j] * W[j] for j in range(d)) + b
            err = pred - yi
            loss += err * err
            gradB += err
            for j in range(d):
                gradW[j] += err * xi[j]
        b -= lr * (gradB / n)
        for j in range(d):
            W[j] -= lr * (gradW[j] / n + l2 * W[j])
        on_epoch(epoch + 1, loss / max(n, 1))
    return {"kind": "linreg", "W": W, "b": b}


def _linreg_predict(params: dict[str, Any], x: list[float]) -> float:
    W, b = params["W"], params["b"]
    return sum(x[j] * W[j] for j in range(len(W))) + b


# --- Torch MLP -------------------------------------------------------------


def _train_mlp(
    X: list[list[float]],
    y: list[Any],
    task: str,
    num_classes: int,
    hyperparams: dict[str, Any],
    on_epoch: Callable[[int, float], None],
    should_stop: Callable[[], bool],
) -> dict[str, Any]:
    import torch
    import torch.nn as nn

    torch.manual_seed(int(hyperparams.get("seed", 0)))
    hidden = int(hyperparams.get("hidden", 64))
    epochs = int(hyperparams.get("epochs", 150))
    lr = float(hyperparams.get("learning_rate", 0.01))
    d = len(X[0]) if X else 0
    out_dim = num_classes if task == "classification" else 1

    model = nn.Sequential(nn.Linear(d, hidden), nn.ReLU(), nn.Linear(hidden, hidden), nn.ReLU(), nn.Linear(hidden, out_dim))
    optimizer = torch.optim.Adam(model.parameters(), lr=lr)
    Xt = torch.tensor(X, dtype=torch.float32)
    if task == "classification":
        yt = torch.tensor(y, dtype=torch.long)
        loss_fn = nn.CrossEntropyLoss()
    else:
        yt = torch.tensor(y, dtype=torch.float32).unsqueeze(1)
        loss_fn = nn.MSELoss()

    for epoch in range(epochs):
        if should_stop():
            break
        model.train(True)
        optimizer.zero_grad()
        out = model(Xt)
        loss = loss_fn(out, yt)
        loss.backward()
        optimizer.step()
        on_epoch(epoch + 1, float(loss.item()))

    return {"kind": "mlp", "task": task, "hidden": hidden, "in_dim": d, "out_dim": out_dim, "state_dict": _state_to_lists(model)}


def _state_to_lists(model: Any) -> dict[str, Any]:
    return {name: tensor.detach().cpu().tolist() for name, tensor in model.state_dict().items()}


def _build_mlp_from_lists(params: dict[str, Any]) -> Any:
    import torch
    import torch.nn as nn

    model = nn.Sequential(
        nn.Linear(params["in_dim"], params["hidden"]),
        nn.ReLU(),
        nn.Linear(params["hidden"], params["hidden"]),
        nn.ReLU(),
        nn.Linear(params["hidden"], params["out_dim"]),
    )
    state = {name: torch.tensor(values) for name, values in params["state_dict"].items()}
    model.load_state_dict(state)
    model.train(False)
    return model


def _mlp_predict(params: dict[str, Any], x: list[float]) -> tuple[Any, list[float] | None]:
    import torch

    model = _build_mlp_from_lists(params)
    with torch.no_grad():
        out = model(torch.tensor([x], dtype=torch.float32))
        if params["task"] == "classification":
            probs = torch.softmax(out, dim=1)[0].tolist()
            return int(out.argmax(dim=1).item()), probs
        return float(out[0][0].item()), None


# --- Registry & orchestration ----------------------------------------------


@dataclass(frozen=True)
class SupervisedAlgoSpec:
    id: str
    label: str
    description: str
    tasks: tuple[str, ...]
    needs_torch: bool
    default_hyperparams: dict[str, Any]
    source: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "label": self.label,
            "description": self.description,
            "tasks": list(self.tasks),
            "needs_torch": self.needs_torch,
            "default_hyperparams": self.default_hyperparams,
            "source": self.source,
            "available": (not self.needs_torch) or _torch_available(),
        }


SUPERVISED_ALGORITHMS: dict[str, SupervisedAlgoSpec] = {
    "logreg": SupervisedAlgoSpec(
        "logreg",
        "Logistic Regression",
        "Softmax (multinomial) logistic regression trained by gradient descent. Pure Python, no Torch.",
        ("classification",),
        False,
        {"epochs": 120, "learning_rate": 0.1, "l2": 0.001},
        "Cox 1958; scikit-learn",
    ),
    "linreg": SupervisedAlgoSpec(
        "linreg",
        "Linear Regression",
        "Least-squares linear regression by gradient descent. Pure Python, no Torch.",
        ("regression",),
        False,
        {"epochs": 200, "learning_rate": 0.05, "l2": 0.001},
        "Legendre/Gauss; scikit-learn",
    ),
    "mlp": SupervisedAlgoSpec(
        "mlp",
        "Neural Net (MLP)",
        "A two-hidden-layer MLP for classification or regression. Handles nonlinear data (Torch).",
        ("classification", "regression"),
        True,
        {"epochs": 150, "learning_rate": 0.01, "hidden": 64, "seed": 0},
        "Rumelhart et al. 1986",
    ),
}


@dataclass(frozen=True)
class TrainingPlan:
    rows: list[Row]
    features: list[str]
    task: str
    spec: SupervisedAlgoSpec


def list_supervised_algorithms() -> list[dict[str, Any]]:
    return [spec.to_dict() for spec in SUPERVISED_ALGORITHMS.values()]


def validate_training_request(
    dataset_id: str,
    *,
    target: str,
    features: list[str] | None = None,
    algo: str = "logreg",
) -> dict[str, Any]:
    plan = _prepare_training_plan(dataset_id, target=target, features=features, algo=algo)
    return {"task": plan.task, "features": plan.features}


def train_supervised(
    dataset_id: str,
    *,
    target: str,
    features: list[str] | None = None,
    algo: str = "logreg",
    hyperparams: dict[str, Any] | None = None,
    on_metric: Callable[[dict[str, Any]], None] | None = None,
    should_stop: Callable[[], bool] | None = None,
    checkpoint_path: Path,
    seed: int = 0,
) -> dict[str, Any]:
    on_metric = on_metric or (lambda _r: None)
    should_stop = should_stop or (lambda: False)
    plan = _prepare_training_plan(dataset_id, target=target, features=features, algo=algo)
    rows = plan.rows

    split = ds.split_indices(len(rows), seed=seed)
    train_rows = [rows[i] for i in split["train"]] or rows
    test_rows = [rows[i] for i in (split["test"] or split["train"])] or rows

    encoder = build_encoder(train_rows, plan.features, target, plan.task, class_rows=rows)
    merged = {**plan.spec.default_hyperparams, **(hyperparams or {}), "seed": seed}
    X_train, y_train = transform(train_rows, encoder)
    X_test, y_test = transform(test_rows, encoder)
    num_classes = len(encoder.get("classes", [])) or 1

    def on_epoch(epoch: int, loss: float) -> None:
        on_metric({"epoch": epoch, "train_loss": round(loss, 6)})

    if algo == "logreg":
        params = _train_logreg(X_train, y_train, num_classes, merged, on_epoch, should_stop)
        preds = [_logreg_predict(params, x)[0] for x in X_test]
        metrics = classification_metrics(y_test, preds, num_classes)
    elif algo == "linreg":
        params = _train_linreg(X_train, y_train, merged, on_epoch, should_stop)
        preds = [_linreg_predict(params, x) for x in X_test]
        metrics = regression_metrics(y_test, preds)
    else:  # mlp
        params = _train_mlp(X_train, y_train, plan.task, num_classes, merged, on_epoch, should_stop)
        if plan.task == "classification":
            preds = [_mlp_predict(params, x)[0] for x in X_test]
            metrics = classification_metrics(y_test, preds, num_classes)
        else:
            preds = [_mlp_predict(params, x)[0] for x in X_test]
            metrics = regression_metrics(y_test, preds)

    checkpoint = {"encoder": encoder, "params": params, "algo": algo, "task": plan.task, "features": plan.features, "target": target}
    checkpoint_path.parent.mkdir(parents=True, exist_ok=True)
    checkpoint_path.write_text(json.dumps(checkpoint, default=_json_default), encoding="utf-8")

    return {
        "algorithm": algo,
        "task": plan.task,
        "target": target,
        "features": plan.features,
        "train_rows": len(train_rows),
        "test_rows": len(test_rows),
        "metrics": metrics,
        "checkpoint_path": str(checkpoint_path),
    }


def predict_supervised(checkpoint_path: Path, row: Row) -> dict[str, Any]:
    checkpoint = json.loads(checkpoint_path.read_text(encoding="utf-8"))
    encoder = checkpoint["encoder"]
    x = encode_row(row, encoder)
    algo = checkpoint["algo"]
    task = checkpoint["task"]
    params = checkpoint["params"]
    if algo == "logreg":
        idx, probs = _logreg_predict(params, x)
        return {"task": task, "prediction": encoder["classes"][idx], "probabilities": _label_probs(encoder["classes"], probs)}
    if algo == "linreg":
        return {"task": task, "prediction": round(_linreg_predict(params, x), 4)}
    # mlp
    pred, probs = _mlp_predict(params, x)
    if task == "classification":
        return {"task": task, "prediction": encoder["classes"][pred], "probabilities": _label_probs(encoder["classes"], probs or [])}
    return {"task": task, "prediction": round(float(pred), 4)}


def _label_probs(classes: list[str], probs: list[float]) -> dict[str, float]:
    return {classes[i]: round(probs[i], 4) for i in range(min(len(classes), len(probs)))}


def _all_columns(rows: list[Row]) -> list[str]:
    cols: list[str] = []
    for row in rows:
        for key in row:
            if key not in cols:
                cols.append(key)
    return cols


def _prepare_training_plan(dataset_id: str, *, target: str, features: list[str] | None, algo: str) -> TrainingPlan:
    rows = ds.load_rows(dataset_id)
    if not rows:
        raise ValueError(f"Dataset '{dataset_id}' has no rows.")

    feature_cols = _resolve_feature_columns(rows, target, features)
    task = infer_task(rows, target)
    _validate_target_values(rows, target, task)

    spec = SUPERVISED_ALGORITHMS.get(algo)
    if spec is None:
        raise ValueError(f"Unknown algorithm '{algo}'. Known: {sorted(SUPERVISED_ALGORITHMS)}")
    if task not in spec.tasks:
        raise ValueError(f"Algorithm '{algo}' does not support task '{task}'.")
    return TrainingPlan(rows=rows, features=feature_cols, task=task, spec=spec)


def _resolve_feature_columns(rows: list[Row], target: str, features: list[str] | None) -> list[str]:
    columns = _all_columns(rows)
    if target not in columns:
        raise ValueError(f"Target column '{target}' not found in dataset.")
    if features is None:
        return [column for column in columns if column != target]

    out: list[str] = []
    unknown: list[str] = []
    for column in features:
        if column == target:
            raise ValueError(f"Target column '{target}' cannot be used as a feature.")
        if column not in columns:
            unknown.append(column)
        elif column not in out:
            out.append(column)
    if unknown:
        raise ValueError(f"Unknown feature columns: {', '.join(unknown)}.")
    return out


def _validate_target_values(rows: list[Row], target: str, task: str) -> None:
    for row_number, row in enumerate(rows, start=1):
        value = _target_value(row, target, row_number)
        if task == "regression" and not ds._is_number(value):
            raise ValueError(f"Target column '{target}' has non-numeric value at row {row_number}.")


def _target_value(row: Row, target: str, row_number: int) -> Any:
    value = row.get(target)
    if value in (None, ""):
        raise ValueError(f"Target column '{target}' has a missing value at row {row_number}.")
    return value


def _json_default(value: Any) -> Any:
    if hasattr(value, "tolist"):
        return value.tolist()
    return value


def _torch_available() -> bool:
    try:
        import torch  # noqa: F401

        return True
    except Exception:  # noqa: BLE001
        return False
