"""Operator skill registry for Chipmunk and the four resident worker models.

A *skill* is a concrete, named capability an operator/worker can perform inside
Brain Spa. Before this registry the workers were described abstractly ("Training
Model fine-tunes"); now each has a precise, invokable skill list tied to real
backend actions in :mod:`packages.brainspa_ml`.

Each :class:`SkillSpec` is written like a good tool description: a one-line
purpose, when to use it, the inputs it needs, and an example phrase that routes
to it. The API exposes this registry at ``/api/agents/skills`` and Chipmunk uses
the ``triggers`` to route free-text requests.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

# The resident workers, in loop order, plus the operator.
WORKERS: dict[str, dict[str, str]] = {
    "chipmunk": {
        "label": "Chipmunk",
        "role": "Operator",
        "summary": "The JARVIS-style operator. Routes requests across the loop and reports live state.",
    },
    "source_model": {
        "label": "Source Model",
        "role": "Evidence",
        "summary": "Finds and curates proof of the behavior the user wants to train.",
    },
    "data_model": {
        "label": "Data Model",
        "role": "Datasets",
        "summary": "Turns evidence and uploads into training-ready datasets and preference pairs.",
    },
    "training_model": {
        "label": "Training Model",
        "role": "Tune",
        "summary": "Trains models from scratch — RL policies and tabular learners — and tracks runs.",
    },
    "harness_model": {
        "label": "Harness Model",
        "role": "Test",
        "summary": "Builds environments and scores trained models against them.",
    },
}


@dataclass(frozen=True)
class SkillSpec:
    key: str
    label: str
    worker: str
    loop_stage: str  # evidence | datasets | tune | test | operator
    description: str
    when_to_use: str
    inputs: tuple[str, ...] = ()
    example: str = ""
    triggers: tuple[str, ...] = ()
    backend: str = ""  # dotted reference to the function that fulfils it
    kind: str = "action"  # action | query | doc

    def to_dict(self) -> dict[str, Any]:
        return {
            "key": self.key,
            "label": self.label,
            "worker": self.worker,
            "worker_label": WORKERS.get(self.worker, {}).get("label", self.worker),
            "loop_stage": self.loop_stage,
            "description": self.description,
            "when_to_use": self.when_to_use,
            "inputs": list(self.inputs),
            "example": self.example,
            "triggers": list(self.triggers),
            "backend": self.backend,
            "kind": self.kind,
        }


SKILLS: tuple[SkillSpec, ...] = (
    # --- Operator (Chipmunk) ---
    SkillSpec(
        key="route_request",
        label="Route a loop request",
        worker="chipmunk",
        loop_stage="operator",
        description="Read a free-text request and hand it to the right worker and loop stage.",
        when_to_use="Always, first. Chipmunk classifies intent before any worker acts.",
        inputs=("message",),
        example="train a cartpole agent with ppo",
        triggers=(),
        backend="apps.api.brainspa_api.workflows.chipmunk_reply",
        kind="action",
    ),
    SkillSpec(
        key="summarize_loop_state",
        label="Summarize loop state",
        worker="chipmunk",
        loop_stage="operator",
        description="Report the freshest artifact in each loop stage and the status of running jobs.",
        when_to_use="When the user asks 'what's going on', 'status', or opens the operator sidebar.",
        inputs=(),
        example="status",
        triggers=("status", "what's running", "overview", "summary"),
        backend="packages.brainspa_ml.runs.list_runs",
        kind="query",
    ),
    # --- Source Model (Evidence) ---
    SkillSpec(
        key="collect_evidence",
        label="Collect behavior evidence",
        worker="source_model",
        loop_stage="evidence",
        description="Gather and cite sources that prove the behavior the model should learn.",
        when_to_use="Before generating datasets, when a behavior needs grounded proof.",
        inputs=("behavior_focus", "source"),
        example="find evidence that the model should refuse unsafe code",
        triggers=("evidence", "source", "proof", "citation"),
        backend="apps.api.brainspa_api.evidence_store.start_source_ingest",
        kind="action",
    ),
    # --- Data Model (Datasets) ---
    SkillSpec(
        key="ingest_tabular_dataset",
        label="Ingest a tabular dataset",
        worker="data_model",
        loop_stage="datasets",
        description="Parse an uploaded CSV/JSONL file into rows, infer a schema, and store it for training.",
        when_to_use="When a user brings their own data for a classification or regression task.",
        inputs=("name", "content", "format"),
        example="upload my customers.csv as a dataset",
        triggers=("upload dataset", "ingest", "import csv", "import jsonl"),
        backend="packages.brainspa_ml.datasets.ingest_tabular",
        kind="action",
    ),
    SkillSpec(
        key="generate_builtin_dataset",
        label="Generate a starter dataset",
        worker="data_model",
        loop_stage="datasets",
        description="Create a built-in toy dataset (blobs, moons, linear) so training can start with zero files.",
        when_to_use="When the user wants to try the platform immediately or learn a method.",
        inputs=("name",),
        example="give me a toy classification dataset",
        triggers=("toy dataset", "sample dataset", "starter dataset", "example data"),
        backend="packages.brainspa_ml.datasets.generate_builtin",
        kind="action",
    ),
    SkillSpec(
        key="profile_dataset",
        label="Profile a dataset",
        worker="data_model",
        loop_stage="datasets",
        description="Report column types, missing values, ranges, and class balance for a stored dataset.",
        when_to_use="Before training, to pick the target column and spot data problems.",
        inputs=("dataset_id",),
        example="profile the iris dataset",
        triggers=("profile dataset", "describe dataset", "columns", "dataset stats"),
        backend="packages.brainspa_ml.datasets.profile_columns",
        kind="query",
    ),
    # --- Training Model (Tune) ---
    SkillSpec(
        key="train_rl_policy",
        label="Train an RL policy",
        worker="training_model",
        loop_stage="tune",
        description="Train an agent from scratch on a registered environment with PPO, DQN, REINFORCE, or tabular Q-learning.",
        when_to_use="When the behavior is actions in a world with rewards (CartPole, GridWorld, Snake).",
        inputs=("env_id", "algo", "hyperparams"),
        example="train cartpole with ppo for 60000 steps",
        triggers=("train", "policy", "reinforcement", "rl", "agent"),
        backend="packages.brainspa_ml.jobs.submit_rl_job",
        kind="action",
    ),
    SkillSpec(
        key="train_supervised_model",
        label="Train a supervised model",
        worker="training_model",
        loop_stage="tune",
        description="Fit a classifier or regressor (logistic/linear regression or an MLP) on a tabular dataset.",
        when_to_use="When the task is predicting a label or value from columns of data.",
        inputs=("dataset_id", "target", "algo"),
        example="train a classifier on my dataset predicting churn",
        triggers=("classify", "regression", "predict", "supervised", "fit model"),
        backend="packages.brainspa_ml.jobs.submit_supervised_job",
        kind="action",
    ),
    SkillSpec(
        key="recommend_algorithm",
        label="Recommend an algorithm",
        worker="training_model",
        loop_stage="tune",
        description="Suggest the best-fit algorithm for a task given the environment/dataset shape and whether Torch is present.",
        when_to_use="When the user is unsure which method to pick.",
        inputs=("kind", "target"),
        example="which algorithm should I use for gridworld?",
        triggers=("which algorithm", "what algorithm", "recommend", "best method"),
        backend="apps.api.brainspa_api.agents_api.recommend_algorithm",
        kind="query",
    ),
    SkillSpec(
        key="list_runs",
        label="List training runs",
        worker="training_model",
        loop_stage="tune",
        description="List recent experiments with status, algorithm, and best result.",
        when_to_use="To review what has been trained and find a checkpoint to test or compare.",
        inputs=(),
        example="show my training runs",
        triggers=("list runs", "experiments", "my runs", "training history"),
        backend="packages.brainspa_ml.runs.list_runs",
        kind="query",
    ),
    SkillSpec(
        key="compare_runs",
        label="Compare runs",
        worker="training_model",
        loop_stage="tune",
        description="Compare two or more runs by their final metric to see which configuration won.",
        when_to_use="After a hyperparameter sweep, to pick the best run.",
        inputs=("run_ids",),
        example="compare run-0003 and run-0004",
        triggers=("compare runs", "compare run", "which run is better"),
        backend="apps.api.brainspa_api.agents_api.compare_runs",
        kind="query",
    ),
    SkillSpec(
        key="stop_run",
        label="Stop a run",
        worker="training_model",
        loop_stage="tune",
        description="Gracefully stop a running training job and keep its checkpoint.",
        when_to_use="When a run has converged or is going nowhere.",
        inputs=("run_id",),
        example="stop run-0005",
        triggers=("stop run", "cancel run", "halt training"),
        backend="packages.brainspa_ml.jobs.stop_run",
        kind="action",
    ),
    # --- Harness Model (Test) ---
    SkillSpec(
        key="list_environments",
        label="List environments",
        worker="harness_model",
        loop_stage="test",
        description="List registered environments with their observation/action shapes and which algorithms fit.",
        when_to_use="When choosing where to train or test a policy.",
        inputs=(),
        example="what environments can I train on?",
        triggers=("list environments", "environments", "what envs"),
        backend="packages.brainspa_ml.environments.list_env_specs",
        kind="query",
    ),
    SkillSpec(
        key="rollout_policy",
        label="Roll out a trained policy",
        worker="harness_model",
        loop_stage="test",
        description="Run a greedy episode with a trained policy and return the trajectory for watching/scoring.",
        when_to_use="To watch or score what a finished run actually learned.",
        inputs=("run_id",),
        example="watch run-0002 play",
        triggers=("rollout", "watch policy", "play run", "evaluate run"),
        backend="packages.brainspa_ml.jobs.run_inference",
        kind="action",
    ),
    SkillSpec(
        key="predict_with_model",
        label="Predict with a trained model",
        worker="harness_model",
        loop_stage="test",
        description="Run a single-row prediction against a finished supervised run and return label/value + probabilities.",
        when_to_use="To sanity-check a classifier or regressor on a hand-typed example.",
        inputs=("run_id", "row"),
        example="predict churn for this customer",
        triggers=("predict", "inference", "classify this", "score this"),
        backend="packages.brainspa_ml.jobs.run_inference",
        kind="action",
    ),
)


def list_skills() -> list[dict[str, Any]]:
    return [skill.to_dict() for skill in SKILLS]


def skills_by_worker() -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for worker_key, meta in WORKERS.items():
        worker_skills = [s.to_dict() for s in SKILLS if s.worker == worker_key]
        out.append(
            {
                "key": worker_key,
                "label": meta["label"],
                "role": meta["role"],
                "summary": meta["summary"],
                "skills": worker_skills,
                "skill_count": len(worker_skills),
            }
        )
    return out


def find_skill(message: str) -> SkillSpec | None:
    """Return the first skill whose triggers match the message, if any."""

    lowered = message.lower()
    for skill in SKILLS:
        for trigger in skill.triggers:
            if trigger in lowered:
                return skill
    return None
