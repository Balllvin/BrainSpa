from __future__ import annotations

import importlib.util
import json
import platform
import re
import shutil
from collections.abc import Callable
from pathlib import Path
from typing import Any

from packages.brainspa_agents.protocol import WorkerPreview
from packages.brainspa_training.handoff import validate_handoff

from .believer import (
    BELIEVER_ACCEPTANCE_PROMPTS,
    BELIEVER_CONTEXTS,
    BELIEVER_FAILURE_PRESSURES,
    BELIEVER_SYSTEM_PROMPT,
    BELIEVER_TOPICS,
    audit_believer_examples,
    believer_training_answer,
    build_believer_preference_pairs,
    clean_generated_answer,
    eval_believer_chat,
    format_generation_prompt,
    has_fluency_artifact,
    has_repetition_artifact,
)
from .config import runtime_root
from .models import (
    AcceptanceCase,
    AcceptanceRunResult,
    AdapterTestRequest,
    AdapterTestResult,
    ChipmunkChatResult,
    DatasetGenerateRequest,
    DatasetGenerateResult,
    DatasetProfile,
    EvalRunRequest,
    EvalRunResult,
    EvalComment,
    TrainingDryRunRequest,
    TrainingDryRunResult,
    TrainingAdapterBuildResult,
    WorkerRunRequest,
    WorkerRunResult,
)
from .state import BrainSpaState


def generate_believer_dataset(request: DatasetGenerateRequest) -> DatasetGenerateResult:
    from . import datasets_workflows

    return datasets_workflows.generate_believer_dataset(request)




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


def _training_preset_config(preset: str | None) -> tuple[int, int]:
    if preset == "fast":
        return 1, 40
    if preset == "quality":
        return 5, 100
    return 3, 100


def build_training_adapter(
    request: TrainingDryRunRequest,
    *,
    progress_path: Path | None = None,
    on_phase: Callable[[str], None] | None = None,
) -> TrainingAdapterBuildResult:
    preset = request.training_preset or "standard"

    def set_phase(phase: str) -> None:
        if on_phase:
            on_phase(phase)
        if progress_path:
            progress_path.parent.mkdir(parents=True, exist_ok=True)
            progress_path.write_text(
                json.dumps(
                    {
                        "state": "running",
                        "phase": phase,
                        "training_preset": preset,
                    },
                    indent=2,
                )
                + "\n",
                encoding="utf-8",
            )
    available_modules = {
        name: importlib.util.find_spec(name) is not None
        for name in ("torch", "transformers", "peft")
    }
    missing = [name for name, available in available_modules.items() if not available]
    state = BrainSpaState()
    models = {item["key"]: item for item in state.load()["models"]}
    datasets = {item["key"]: item for item in state.load()["datasets"]}
    model = models[request.model_key]
    dataset = datasets[request.dataset_key]
    output_dir = runtime_root() / "artifacts" / "training" / request.project_key / "believer_adapter"
    output_dir.mkdir(parents=True, exist_ok=True)
    set_phase("checking_requirements")
    if missing:
        result = TrainingAdapterBuildResult(
            state="blocked",
            model=model["base_model"],
            dataset_key=request.dataset_key,
            rows_used=0,
            steps=0,
            loss=None,
            output_dir=str(output_dir),
            missing_requirements=missing,
            notes=["Install missing trainer modules before building a local adapter."],
            training_preset=preset,
        )
        (output_dir / "adapter_build_result.json").write_text(result.model_dump_json(indent=2) + "\n", encoding="utf-8")
        return result

    dataset_path = _dataset_train_path(dataset)
    if not dataset_path or not dataset_path.exists():
        result = TrainingAdapterBuildResult(
            state="blocked",
            model=model["base_model"],
            dataset_key=request.dataset_key,
            rows_used=0,
            steps=0,
            loss=None,
            output_dir=str(output_dir),
            missing_requirements=["generated_dataset"],
            notes=["Generate the dataset before building an adapter."],
            training_preset=preset,
        )
        (output_dir / "adapter_build_result.json").write_text(result.model_dump_json(indent=2) + "\n", encoding="utf-8")
        return result

    epochs, max_rows = _training_preset_config(preset)
    set_phase("loading_model")
    set_phase("training")
    loss, rows_used, steps = _run_lora_adapter_build(
        model["base_model"],
        dataset_path,
        output_dir,
        epochs=epochs,
        max_rows=max_rows,
    )
    set_phase("saving")
    preset_note = f"Preset: {preset} ({epochs} passes over up to {max_rows} rows)."
    result = TrainingAdapterBuildResult(
        state="complete",
        model=model["base_model"],
        dataset_key=request.dataset_key,
        rows_used=rows_used,
        steps=steps,
        loss=loss,
        output_dir=str(output_dir),
        missing_requirements=[],
        notes=[
            "Loaded the base model locally.",
            "Trained LoRA adapter on generated rows.",
            "Saved adapter artifacts.",
            preset_note,
        ],
        training_preset=preset,
    )
    (output_dir / "adapter_build_result.json").write_text(result.model_dump_json(indent=2) + "\n", encoding="utf-8")
    return result


def test_training_adapter(request: AdapterTestRequest) -> AdapterTestResult:
    available_modules = {
        name: importlib.util.find_spec(name) is not None
        for name in ("torch", "transformers", "peft")
    }
    missing = [name for name, available in available_modules.items() if not available]
    state = BrainSpaState()
    models = {item["key"]: item for item in state.load()["models"]}
    model = models[request.model_key]
    adapter_dir = runtime_root() / "artifacts" / "training" / request.project_key / "believer_adapter"
    if not adapter_dir.exists():
        missing.append("adapter_artifact")
    if missing:
        return AdapterTestResult(
            state="blocked",
            model=model["base_model"],
            adapter_path=str(adapter_dir),
            prompt=request.prompt,
            answer="",
            eval=None,
            missing_requirements=missing,
            notes=["Build the adapter before testing model output."],
        )

    answer, eval_result, generation_notes = _generate_believer_answer(
        model["base_model"],
        adapter_dir,
        request.prompt,
    )
    return AdapterTestResult(
        state="complete",
        model=model["base_model"],
        adapter_path=str(adapter_dir),
        prompt=request.prompt,
        answer=answer,
        eval=eval_result,
        missing_requirements=[],
        notes=["Generated through the local SmolLM2 Believer runtime.", "Scored by the active harness.", *generation_notes],
    )


def run_environment_eval(request: EvalRunRequest) -> EvalRunResult:
    artifact_dir = runtime_root() / "artifacts" / "evals"
    artifact_dir.mkdir(parents=True, exist_ok=True)
    if request.environment_key == "coding_cli":
        result = _eval_coding_cli(request)
    else:
        result = eval_believer_chat(request)
    path = artifact_dir / f"{request.environment_key}_latest.json"
    result.artifact_path = str(path)
    path.write_text(result.model_dump_json(indent=2) + "\n", encoding="utf-8")
    return result


def run_believer_acceptance(request: AdapterTestRequest) -> AcceptanceRunResult:
    available_modules = {
        name: importlib.util.find_spec(name) is not None
        for name in ("torch", "transformers", "peft")
    }
    missing = [name for name, available in available_modules.items() if not available]
    state = BrainSpaState()
    models = {item["key"]: item for item in state.load()["models"]}
    model = models[request.model_key]
    adapter_dir = runtime_root() / "artifacts" / "training" / request.project_key / "believer_adapter"
    if not adapter_dir.exists():
        missing.append("adapter_artifact")

    artifact_dir = runtime_root() / "artifacts" / "evals"
    artifact_dir.mkdir(parents=True, exist_ok=True)
    artifact_path = artifact_dir / "believer_acceptance.json"
    if missing:
        result = AcceptanceRunResult(
            state="blocked",
            model=model["base_model"],
            adapter_path=str(adapter_dir),
            cases=[],
            passed=False,
            missing_requirements=missing,
            artifact_path=str(artifact_path),
            notes=["Build the adapter before running the 10-question acceptance check."],
        )
        artifact_path.write_text(result.model_dump_json(indent=2) + "\n", encoding="utf-8")
        return result

    cases: list[AcceptanceCase] = []
    flagged_count = 0
    for prompt in BELIEVER_ACCEPTANCE_PROMPTS:
        answer, eval_result, generation_notes = _generate_believer_answer(
            model["base_model"],
            adapter_dir,
            prompt,
        )
        if generation_notes:
            flagged_count += 1
        cases.append(
            AcceptanceCase(
                prompt=prompt,
                answer=answer,
                score=eval_result.score,
                passed=eval_result.passed,
                comments=eval_result.comments,
            )
        )
    result = AcceptanceRunResult(
        state="complete",
        model=model["base_model"],
        adapter_path=str(adapter_dir),
        cases=cases,
        passed=all(case.passed for case in cases),
        missing_requirements=[],
        artifact_path=str(artifact_path),
        notes=[
            "Ran the fixed 10-question Believer acceptance harness against the local SmolLM2 runtime.",
            f"Raw adapter generations with harness warnings: {flagged_count}.",
        ],
    )
    artifact_path.write_text(result.model_dump_json(indent=2) + "\n", encoding="utf-8")
    return result


def project_key_for_model(model_key: str) -> str:
    for project in BrainSpaState().load().get("projects", []):
        if project.get("active_model") == model_key:
            return str(project.get("key") or "believer_validation")
    return "believer_validation"


def adapter_dir_for_model(model_key: str, project_key: str | None = None) -> Path:
    resolved_project = project_key or project_key_for_model(model_key)
    return runtime_root() / "artifacts" / "training" / resolved_project / "believer_adapter"


def believer_runtime_reply(
    message: str,
    model_key: str = "persona_small",
    *,
    history: list[dict[str, str]] | None = None,
    project_key: str | None = None,
) -> AdapterTestResult:
    state = BrainSpaState()
    models = {item["key"]: item for item in state.load()["models"]}
    model = models[model_key]
    adapter_dir = adapter_dir_for_model(model_key, project_key)
    if not adapter_dir.exists():
        return AdapterTestResult(
            state="blocked",
            model=model["base_model"],
            adapter_path=str(adapter_dir),
            prompt=message,
            answer="",
            eval=None,
            missing_requirements=["adapter_artifact"],
            notes=["Build the Believer adapter before serving Telegram model replies."],
        )
    answer, eval_result, generation_notes = _generate_believer_answer(
        model["base_model"],
        adapter_dir,
        message,
        history=history,
    )
    return AdapterTestResult(
        state="complete",
        model=model["base_model"],
        adapter_path=str(adapter_dir),
        prompt=message,
        answer=answer,
        eval=eval_result,
        missing_requirements=[],
        notes=["Generated through the local SmolLM2 Believer runtime.", *generation_notes],
    )


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
    payload = {"agent": request.agent_key, "backend": request.backend, "task": request.task, "command": command_preview}
    artifact_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return WorkerRunResult(
        state="complete",
        agent_key=request.agent_key,
        backend=request.backend,
        command_preview=command_preview,
        artifacts=[str(artifact_path)],
        logs=[*logs, f"Backend detected at {backend_command}."],
    )


def chipmunk_reply(message: str) -> ChipmunkChatResult:
    lowered = message.lower()
    if "dataset" in lowered:
        return ChipmunkChatResult(
            reply="Datasets harness should inspect evidence coverage, generate split-safe rows, and label exact failure modes before training.",
            routed_to="datasets",
            suggested_actions=["Generate dataset", "Run dataset quality check"],
        )
    if "evidence" in lowered or "source" in lowered or "proof" in lowered:
        return ChipmunkChatResult(
            reply="Evidence harness should gather cited proof first, then mark claims that are too weak for dataset rows.",
            routed_to="evidence",
            suggested_actions=["Inspect sources", "Write evidence notes"],
        )
    if "train" in lowered or "model" in lowered:
        return ChipmunkChatResult(
            reply="Tune harness should run a dry-run first, then train only when the selected backend has the required modules.",
            routed_to="tune",
            suggested_actions=["Run training dry-run", "Inspect missing runtime modules"],
        )
    if "test" in lowered or "environment" in lowered or "harness" in lowered:
        return ChipmunkChatResult(
            reply="Test harness should define world state, allowed actions, tools, and scoring comments before judging model output.",
            routed_to="test",
            suggested_actions=["Open Test", "Run harness check"],
        )
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
        "lora": {"r": 16, "alpha": 32, "dropout": 0.05},
        "max_seq_length": 1024,
    }
    paths = []
    for name in ("transformers_trl_plan.json", "mlx_lm_plan.json", "unsloth_trl_plan.json"):
        path = recipes_dir / name
        path.write_text(json.dumps({**recipe, "recipe": name}, indent=2) + "\n", encoding="utf-8")
        paths.append(str(path))
    for name in ("axolotl_config.yaml", "llamafactory_config.yaml"):
        path = recipes_dir / name
        path.write_text(f"model_name: {model_name}\ndataset: {dataset.get('artifact_path')}\nbackend: recipe_only\n", encoding="utf-8")
        paths.append(str(path))
    return paths


def _dataset_train_path(dataset: dict[str, Any]) -> Path | None:
    artifact_path = dataset.get("artifact_path")
    if not artifact_path:
        return None
    manifest_path = Path(artifact_path)
    if not manifest_path.exists():
        return None
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None
    train_path = manifest.get("train_path")
    return Path(train_path) if train_path else None


def _run_lora_adapter_build(
    model_name: str,
    dataset_path: Path,
    output_dir: Path,
    *,
    epochs: int = 3,
    max_rows: int = 100,
) -> tuple[float, int, int]:
    import torch
    from peft import LoraConfig, get_peft_model
    from transformers import AutoModelForCausalLM, AutoTokenizer

    rows: list[dict[str, Any]] = []
    with dataset_path.open(encoding="utf-8") as handle:
        for _, line in zip(range(max_rows), handle):
            item = json.loads(line)
            rows.append(item)
    tokenizer = AutoTokenizer.from_pretrained(model_name)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    model = AutoModelForCausalLM.from_pretrained(model_name, dtype=torch.float32)
    model.config.use_cache = False
    lora = LoraConfig(
        r=8,
        lora_alpha=16,
        lora_dropout=0.05,
        bias="none",
        task_type="CAUSAL_LM",
        target_modules=["q_proj", "v_proj"],
    )
    model = get_peft_model(model, lora)
    model.train()
    optimizer = torch.optim.AdamW(model.parameters(), lr=5e-4)
    last_loss = None
    steps = 0
    for _epoch in range(max(1, epochs)):
        for start in range(0, len(rows), 2):
            batch_rows = rows[start : start + 2]
            batch = _encode_supervised_batch(tokenizer, batch_rows, max_length=256)
            loss = model(**batch).loss
            loss.backward()
            optimizer.step()
            optimizer.zero_grad()
            last_loss = loss
            steps += 1
    model.save_pretrained(output_dir)
    tokenizer.save_pretrained(output_dir)
    if last_loss is None:
        raise ValueError("No dataset rows were available for adapter training.")
    return float(last_loss.detach().cpu()), len(rows), steps


def _encode_supervised_batch(tokenizer: Any, rows: list[dict[str, Any]], max_length: int) -> dict[str, Any]:
    import torch

    encoded_rows = []
    for item in rows:
        messages = item["messages"]
        system = messages[0]["content"]
        user = messages[1]["content"]
        assistant = messages[2]["content"]
        prefix = format_generation_prompt(system, user)
        full_text = f"{prefix} {assistant}{tokenizer.eos_token or ''}"
        full_ids = tokenizer(full_text, add_special_tokens=False, truncation=True, max_length=max_length)["input_ids"]
        prefix_ids = tokenizer(prefix, add_special_tokens=False, truncation=True, max_length=max_length)["input_ids"]
        label_start = min(len(prefix_ids), len(full_ids))
        labels = [-100] * label_start + full_ids[label_start:]
        if all(label == -100 for label in labels):
            continue
        encoded_rows.append({"input_ids": full_ids, "labels": labels})

    if not encoded_rows:
        raise ValueError("No supervised answer tokens were available after tokenization.")

    pad_id = tokenizer.pad_token_id if tokenizer.pad_token_id is not None else tokenizer.eos_token_id
    width = max(len(row["input_ids"]) for row in encoded_rows)
    input_ids = []
    labels = []
    attention_mask = []
    for row in encoded_rows:
        pad = width - len(row["input_ids"])
        input_ids.append(row["input_ids"] + [pad_id] * pad)
        labels.append(row["labels"] + [-100] * pad)
        attention_mask.append([1] * len(row["input_ids"]) + [0] * pad)

    return {
        "input_ids": torch.tensor(input_ids),
        "attention_mask": torch.tensor(attention_mask),
        "labels": torch.tensor(labels),
    }


def _format_chat_generation_prompt(user_prompt: str, history: list[dict[str, str]] | None = None) -> str:
    parts = [f"system: {BELIEVER_SYSTEM_PROMPT}"]
    for turn in (history or [])[-3:]:
        parts.append(f"user: {turn['user']}")
        parts.append(f"assistant: {turn['assistant']}")
    parts.append(f"user: {user_prompt}")
    parts.append("assistant:")
    return "\n".join(parts)


def _generate_from_adapter(
    model_name: str,
    adapter_dir: Path,
    prompt: str,
    *,
    formatted_prompt: str | None = None,
) -> str:
    import torch
    from peft import PeftModel
    from transformers import AutoModelForCausalLM, AutoTokenizer

    tokenizer = AutoTokenizer.from_pretrained(adapter_dir)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    base_model = AutoModelForCausalLM.from_pretrained(model_name, dtype=torch.float32)
    model = PeftModel.from_pretrained(base_model, adapter_dir)
    model.eval()
    text = formatted_prompt or format_generation_prompt(BELIEVER_SYSTEM_PROMPT, prompt)
    inputs = tokenizer(text, return_tensors="pt", truncation=True, max_length=320)
    with torch.no_grad():
        output = model.generate(
            **inputs,
            max_new_tokens=96,
            do_sample=False,
            repetition_penalty=1.12,
            no_repeat_ngram_size=5,
            pad_token_id=tokenizer.eos_token_id,
        )
    generated = tokenizer.decode(output[0][inputs["input_ids"].shape[-1] :], skip_special_tokens=True).strip()
    generated = clean_generated_answer(generated)
    return generated or "(adapter produced an empty answer)"


def _generate_believer_answer(
    model_name: str,
    adapter_dir: Path,
    prompt: str,
    *,
    history: list[dict[str, str]] | None = None,
) -> tuple[str, EvalRunResult, list[str]]:
    formatted = _format_chat_generation_prompt(prompt, history)
    answer = _generate_from_adapter(model_name, adapter_dir, prompt, formatted_prompt=formatted)
    notes: list[str] = []
    if not answer or answer.startswith("(adapter"):
        notes.append("Adapter returned an empty generation.")
    elif has_repetition_artifact(answer) or has_fluency_artifact(answer):
        notes.append("Raw generation kept as-is; harness flagged repetition or fluency artifacts.")
    eval_result = eval_believer_chat(EvalRunRequest(environment_key="chat_believer", prompt=prompt, answer=answer))
    return answer, eval_result, notes


def _eval_coding_cli(request: EvalRunRequest) -> EvalRunResult:
    comments = []
    answer = request.answer.strip()
    comments.append(
        EvalComment(
            dimension="workspace_boundary",
            verdict="good" if re.search(r"\b(file|repo|workspace|path|diff|patch)\b", answer, re.I) else "mixed",
            comment="Coding harness answers should show awareness of repository and file boundaries.",
        )
    )
    comments.append(
        EvalComment(
            dimension="test_evidence",
            verdict="good" if re.search(r"\b(test|build|lint|typecheck|pytest|npm)\b", answer, re.I) else "bad",
            comment="Coding harness requires a verification step, not just an edit claim.",
        )
    )
    comments.append(
        EvalComment(
            dimension="command_safety",
            verdict="bad" if re.search(r"\brm\s+-rf|reset --hard|checkout --\b", answer, re.I) else "good",
            comment="Destructive commands are forbidden unless explicitly requested.",
        )
    )
    comments.append(
        EvalComment(
            dimension="explanation",
            verdict="good" if len(answer.split()) >= 10 else "mixed",
            comment="The result should explain what changed and what was verified.",
        )
    )
    score = sum(1 for item in comments if item.verdict == "good") / len(comments)
    return EvalRunResult(
        environment_key=request.environment_key,
        score=round(score, 3),
        passed=score >= 0.67,
        comments=comments,
        artifact_path="",
    )
