from __future__ import annotations

import importlib.util
import json
import platform
import re
import shutil
import subprocess
from collections.abc import Callable
from pathlib import Path
from typing import Any

from packages.brainspa_agents.protocol import WorkerPreview

from .config import runtime_root
from .models import (
    AdapterTestRequest,
    AdapterTestResult,
    ChipmunkChatResult,
    EvalComment,
    EvalRunRequest,
    EvalRunResult,
    TrainingAdapterBuildResult,
    TrainingDryRunRequest,
    TrainingDryRunResult,
    WorkerRunRequest,
    WorkerRunResult,
)
from .state import BrainSpaState


def training_dry_run(request: TrainingDryRunRequest) -> TrainingDryRunResult:
    state = BrainSpaState()
    models = {item["key"]: item for item in state.load()["models"]}
    datasets = {item["key"]: item for item in state.load()["datasets"]}
    model = models[request.model_key]
    dataset = datasets[request.dataset_key]
    output_dir = runtime_root() / "artifacts" / "training" / request.project_key
    output_dir.mkdir(parents=True, exist_ok=True)

    available_modules = {
        name: importlib.util.find_spec(name) is not None
        for name in ("torch", "transformers", "datasets", "trl", "peft", "unsloth", "mlx_lm")
    }
    backend = request.preferred_backend or _recommend_backend(available_modules)
    missing = _missing_for_backend(backend, available_modules)
    recipes = _write_recipes(output_dir, model["base_model"], dataset, backend)
    result = TrainingDryRunResult(
        state="blocked" if missing else "complete",
        backend=backend,
        model=model["base_model"],
        dataset_key=request.dataset_key,
        output_dir=str(output_dir),
        missing_requirements=missing,
        recipes=recipes,
        notes=[
            f"Host: {platform.system()} {platform.machine()}",
            "Dry-run only: no model weights were changed.",
            "Brain Spa will not silently switch runtime backends.",
        ],
    )
    (output_dir / "dry_run.json").write_text(result.model_dump_json(indent=2) + "\n", encoding="utf-8")
    return result


def build_training_adapter(
    request: TrainingDryRunRequest,
    *,
    progress_path: Path | None = None,
    on_phase: Callable[[str], None] | None = None,
) -> TrainingAdapterBuildResult:
    preset = request.training_preset or "standard"
    if on_phase:
        on_phase("blocked")
    if progress_path:
        progress_path.parent.mkdir(parents=True, exist_ok=True)
        progress_path.write_text(
            json.dumps({"state": "blocked", "phase": "not_shipped", "training_preset": preset}, indent=2) + "\n",
            encoding="utf-8",
        )

    state = BrainSpaState()
    models = {item["key"]: item for item in state.load()["models"]}
    model = models[request.model_key]
    output_dir = runtime_root() / "artifacts" / "training" / request.project_key
    output_dir.mkdir(parents=True, exist_ok=True)
    result = TrainingAdapterBuildResult(
        state="blocked",
        model=model["base_model"],
        dataset_key=request.dataset_key,
        rows_used=0,
        steps=0,
        loss=None,
        output_dir=str(output_dir),
        missing_requirements=["policy_training_uses_snake_test_pages"],
        notes=["This public shell does not ship a text adapter build. Use Snake Test autonomous train for the reference policy."],
        training_preset=preset,
    )
    (output_dir / "adapter_build_result.json").write_text(result.model_dump_json(indent=2) + "\n", encoding="utf-8")
    return result


def test_training_adapter(request: AdapterTestRequest) -> AdapterTestResult:
    state = BrainSpaState()
    models = {item["key"]: item for item in state.load()["models"]}
    model = models[request.model_key]
    adapter_dir = runtime_root() / "artifacts" / "training" / request.project_key
    return AdapterTestResult(
        state="blocked",
        model=model["base_model"],
        adapter_path=str(adapter_dir),
        prompt=request.prompt,
        answer="",
        eval=None,
        missing_requirements=["no_shipped_chat_adapter"],
        notes=["Snake Policy is tested through environment routes, not chat adapter prompts."],
    )


def run_environment_eval(request: EvalRunRequest) -> EvalRunResult:
    artifact_dir = runtime_root() / "artifacts" / "evals"
    artifact_dir.mkdir(parents=True, exist_ok=True)
    result = _eval_snake_environment(request) if request.environment_key == "snake_10x10" else _eval_generic_environment(request)
    path = artifact_dir / f"{request.environment_key}_latest.json"
    result.artifact_path = str(path)
    path.write_text(result.model_dump_json(indent=2) + "\n", encoding="utf-8")
    return result


def run_worker_job(request: WorkerRunRequest) -> WorkerRunResult:
    backend_command = shutil.which(request.backend)
    preview = WorkerPreview(agent_key=request.agent_key, backend=request.backend, task=request.task)
    command_preview = preview.command_preview()
    logs = [
        f"Agent: {request.agent_key}",
        f"Backend: {request.backend}",
        "This is a controlled dry-run preview; no autonomous command was executed.",
    ]
    if not backend_command:
        return WorkerRunResult(
            state="blocked",
            agent_key=request.agent_key,
            backend=request.backend,
            command_preview=command_preview,
            artifacts=[],
            logs=[*logs, "Backend command is not available on PATH."],
        )
    artifact_dir = runtime_root() / "artifacts" / "workers"
    artifact_dir.mkdir(parents=True, exist_ok=True)
    artifact_path = artifact_dir / f"{request.agent_key}_{request.backend}.json"
    artifact_path.write_text(
        json.dumps({"agent": request.agent_key, "backend": request.backend, "task": request.task, "command": command_preview}, indent=2)
        + "\n",
        encoding="utf-8",
    )
    return WorkerRunResult(
        state="complete",
        agent_key=request.agent_key,
        backend=request.backend,
        command_preview=command_preview,
        artifacts=[str(artifact_path)],
        logs=[*logs, f"Backend detected at {backend_command}."],
    )


def project_key_for_model(model_key: str) -> str:
    for project in BrainSpaState().load().get("projects", []):
        if project.get("active_model") == model_key:
            return str(project.get("key") or "")
    return "snake_rl_validation"


def chipmunk_reply(message: str) -> ChipmunkChatResult:
    lowered = message.lower()
    if _asks_for_status(lowered):
        return _chipmunk_status()
    if "dataset" in lowered and ("generate" in lowered or "build" in lowered or "preview" in lowered):
        return ChipmunkChatResult(
            reply="Dataset generation is not seeded in this shell. Run Snake autonomous train to create rollout data locally.",
            routed_to="datasets",
            suggested_actions=["Open Snake Train", "Inspect rollout dataset"],
        )
    if "dry-run" in lowered or "dry run" in lowered:
        return _chipmunk_training_dry_run()
    if "worker" in lowered:
        return _chipmunk_worker_action(lowered, message)
    if ("eval" in lowered or "score" in lowered) and ("test" in lowered or "harness" in lowered):
        return _chipmunk_eval_action(message)
    if "dataset" in lowered:
        return ChipmunkChatResult(
            reply="Datasets should come from explicit evidence or environment rollouts. The shipped reference dataset is Snake rollout data.",
            routed_to="datasets",
            suggested_actions=["Open Datasets", "Open Snake Train"],
        )
    if "evidence" in lowered or "source" in lowered or "proof" in lowered:
        return ChipmunkChatResult(
            reply="Evidence starts empty in this shell. Add cited sources only when a future behavior needs proof.",
            routed_to="evidence",
            suggested_actions=["Inspect sources", "Write evidence notes"],
        )
    if "train" in lowered or "model" in lowered:
        return ChipmunkChatResult(
            reply="Tune should show checkpoint state and dry-run readiness. Snake training runs through the Test environment.",
            routed_to="tune",
            suggested_actions=["Open Tune", "Open Snake Train"],
        )
    if "test" in lowered or "environment" in lowered or "harness" in lowered:
        return ChipmunkChatResult(
            reply="Test harnesses should expose world state, allowed actions, tools, scoring, and failure comments. Snake is the reference.",
            routed_to="test",
            suggested_actions=["Open Test", "Run Snake Train"],
        )
    hermes = _chipmunk_hermes_fallback(message)
    if hermes:
        return hermes
    return ChipmunkChatResult(
        reply="I can route this through Brain Spa, but I need the target: evidence, datasets, tune, test, Telegram, or worker.",
        routed_to="chipmunk",
        suggested_actions=["Open the loop map", "Run a harness check"],
    )


def looks_like_loop_request(message: str) -> bool:
    lowered = message.lower()
    return any(
        keyword in lowered
        for keyword in (
            "dataset",
            "evidence",
            "source",
            "proof",
            "train",
            "model",
            "test",
            "environment",
            "harness",
            "telegram",
            "worker",
        )
    )


def _eval_snake_environment(request: EvalRunRequest) -> EvalRunResult:
    text = f"{request.prompt} {request.answer}".lower()
    dimensions = [
        ("world_state", any(word in text for word in ("grid", "state", "apple", "snake"))),
        ("actions", any(word in text for word in ("action", "left", "right", "straight", "move"))),
        ("scoring", any(word in text for word in ("reward", "score", "apples", "survive", "length"))),
        ("failure", any(word in text for word in ("wall", "collision", "loop", "dead", "fail"))),
    ]
    return _comments_to_result(request.environment_key, dimensions, pass_threshold=0.75)


def _eval_generic_environment(request: EvalRunRequest) -> EvalRunResult:
    text = f"{request.prompt} {request.answer}".lower()
    dimensions = [
        ("world_state", any(word in text for word in ("state", "world", "environment", "observation"))),
        ("actions", any(word in text for word in ("action", "tool", "allowed", "step"))),
        ("scoring", any(word in text for word in ("score", "reward", "metric", "pass"))),
        ("failure", any(word in text for word in ("failure", "error", "blocked", "unsafe"))),
    ]
    return _comments_to_result(request.environment_key, dimensions, pass_threshold=0.75)


def _comments_to_result(environment_key: str, dimensions: list[tuple[str, bool]], pass_threshold: float) -> EvalRunResult:
    passed_count = sum(1 for _, passed in dimensions if passed)
    comments = [
        EvalComment(
            dimension=name,
            verdict="good" if passed else "bad",
            comment=(
                f"{name.replace('_', ' ')} is explicit."
                if passed
                else f"{name.replace('_', ' ')} needs a concrete harness detail."
            ),
        )
        for name, passed in dimensions
    ]
    score = passed_count / len(dimensions)
    return EvalRunResult(
        environment_key=environment_key,
        score=score,
        passed=score >= pass_threshold,
        comments=comments,
        artifact_path="",
    )


def _asks_for_status(lowered: str) -> bool:
    return lowered.strip() in {"status", "/status", "ping", "/start"} or "are you connected" in lowered


def _chipmunk_status() -> ChipmunkChatResult:
    hermes_path = shutil.which("hermes")
    telegram_note = "Telegram route is active through Brain Spa's local poller."
    hermes_note = f"Hermes is installed at {hermes_path}." if hermes_path else "Hermes is not on PATH."
    return ChipmunkChatResult(
        reply=f"Chipmunk is connected. {telegram_note} {hermes_note}",
        routed_to="chipmunk",
        suggested_actions=["Open Snake Train", "Run training dry-run", "Run worker preview"],
    )


def _chipmunk_training_dry_run() -> ChipmunkChatResult:
    result = training_dry_run(TrainingDryRunRequest())
    missing = ", ".join(result.missing_requirements) if result.missing_requirements else "none"
    return ChipmunkChatResult(
        reply=f"Training dry-run {result.state}. Backend: {result.backend}. Missing: {missing}. Output: {result.output_dir}",
        routed_to="tune",
        suggested_actions=["Open Tune", "Inspect missing runtime modules"],
    )


def _chipmunk_worker_action(lowered: str, original: str) -> ChipmunkChatResult:
    agent_key = "evidence"
    for candidate in ("evidence", "datasets", "tune", "test"):
        if candidate in lowered:
            agent_key = candidate
            break
    result = run_worker_job(WorkerRunRequest(agent_key=agent_key, backend="codex", task=original))
    return ChipmunkChatResult(
        reply=f"Worker preview {result.state} for {result.agent_key}. {' '.join(result.logs)}",
        routed_to=agent_key,
        suggested_actions=["Open worker artifact", "Assign backend in Settings"],
    )


def _chipmunk_eval_action(message: str) -> ChipmunkChatResult:
    result = run_environment_eval(
        EvalRunRequest(
            environment_key="snake_10x10",
            prompt=message,
            answer=message,
        )
    )
    verdict = "passed" if result.passed else "needs work"
    return ChipmunkChatResult(
        reply=f"Harness eval {verdict}. Score: {result.score}. Artifact: {result.artifact_path}",
        routed_to="test",
        suggested_actions=["Open Test", "Inspect eval comments"],
    )


def _chipmunk_hermes_fallback(message: str) -> ChipmunkChatResult | None:
    if not shutil.which("hermes"):
        return None
    prompt = (
        "You are Chipmunk, the Brain Spa Hermes operator. Keep the answer short. "
        "Route work through Evidence, Datasets, Tune, and Test. "
        f"User message: {message}"
    )
    try:
        result = subprocess.run(
            ["hermes", "chat", "-q", prompt, "-Q", "--source", "brain-spa"],
            cwd=Path(__file__).resolve().parents[3],
            text=True,
            capture_output=True,
            timeout=45,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        return ChipmunkChatResult(
            reply=f"Hermes is installed, but Chipmunk could not start Hermes: {error}",
            routed_to="chipmunk",
            suggested_actions=["Run hermes status", "Configure Hermes auth"],
        )
    output = _clean_hermes_chat_output((result.stdout or result.stderr).strip())
    if result.returncode != 0 or not output:
        detail = _clean_hermes_error(output)
        return ChipmunkChatResult(
            reply=f"Hermes is installed, but Chipmunk could not connect to a Hermes model: {detail}",
            routed_to="chipmunk",
            suggested_actions=["Run hermes status", "Configure Hermes auth"],
        )
    return ChipmunkChatResult(
        reply=output[:3500],
        routed_to="chipmunk",
        suggested_actions=["Open the loop map", "Run a stage action"],
    )


def _clean_hermes_error(output: str) -> str:
    if not output:
        return "no output"
    lowered = output.lower()
    if "traceback" in lowered or "provider" in lowered or "auth" in lowered or "api key" in lowered:
        return "no authenticated Hermes provider is configured"
    return output.splitlines()[0][:180]


def _clean_hermes_chat_output(output: str) -> str:
    lines = []
    for line in output.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("session_id:"):
            continue
        if "tirith security scanner" in stripped:
            continue
        lines.append(stripped)
    return "\n".join(lines).strip()


def _recommend_backend(modules: dict[str, bool]) -> str:
    if modules["mlx_lm"] and platform.system() == "Darwin" and platform.machine() == "arm64":
        return "mlx_lm"
    if modules["unsloth"]:
        return "unsloth_trl"
    return "transformers_trl"


def _missing_for_backend(backend: str, modules: dict[str, bool]) -> list[str]:
    required = {
        "mlx_lm": ["mlx_lm"],
        "unsloth_trl": ["torch", "transformers", "datasets", "trl", "peft", "unsloth"],
        "transformers_trl": ["torch", "transformers", "datasets", "trl", "peft"],
    }.get(backend, [])
    return [name for name in required if not modules.get(name)]


def _write_recipes(output_dir: Path, model_name: str, dataset: dict[str, Any], backend: str) -> list[str]:
    recipes_dir = output_dir / "trainer_recipes"
    recipes_dir.mkdir(parents=True, exist_ok=True)
    recipe = {
        "backend": backend,
        "model": model_name,
        "dataset_key": dataset["key"],
        "dataset_artifact": dataset.get("artifact_path"),
        "max_seq_length": 1024,
    }
    paths = []
    for name in ("transformers_trl_plan.json", "mlx_lm_plan.json", "unsloth_trl_plan.json"):
        path = recipes_dir / name
        path.write_text(json.dumps({**recipe, "recipe": name}, indent=2) + "\n", encoding="utf-8")
        paths.append(str(path))
    return paths
