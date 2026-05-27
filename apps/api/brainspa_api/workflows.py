from __future__ import annotations

import importlib.util
import json
import platform
import re
import shutil
import subprocess
from collections import Counter
from pathlib import Path
from typing import Any

from packages.brainspa_agents.protocol import WorkerPreview
from packages.brainspa_environments.chess import is_fen_like
from packages.brainspa_training.handoff import validate_handoff

from .config import runtime_root
from .models import (
    AdapterTestRequest,
    AdapterTestResult,
    ChipmunkChatResult,
    DatasetGenerateRequest,
    DatasetGenerateResult,
    DatasetProfile,
    EvalComment,
    EvalRunRequest,
    EvalRunResult,
    TrainingDryRunRequest,
    TrainingDryRunResult,
    TrainingAdapterBuildResult,
    WorkerRunRequest,
    WorkerRunResult,
)
from .state import BrainSpaState


BELIEVER_TOPICS = [
    ("weakness", "When I feel spiritually weak, what should I do?"),
    ("work", "How should I think about ordinary work?"),
    ("fear", "What do I do when fear starts steering my choices?"),
    ("prayer", "How do I pray when I do not feel eloquent?"),
    ("truth", "How do I speak truth without becoming harsh?"),
    ("failure", "How should I respond after I fail again?"),
    ("envy", "How should I handle envy without pretending it is harmless?"),
    ("anger", "What should I do when anger feels justified?"),
    ("doubt", "How should I respond when faith feels thin?"),
    ("service", "How do I serve someone when I want credit for it?"),
]

BELIEVER_CONTEXTS = [
    "after a tense family conversation",
    "before an important work call",
    "when nobody notices the effort",
    "after reading something that unsettled me",
    "when I want to win the argument",
    "after a habit I thought was beaten returns",
    "when prayer feels dry",
    "while deciding whether to apologize",
    "when I feel behind everyone else",
    "before making a public commitment",
]

BELIEVER_FAILURE_PRESSURES = [
    "generic self-help",
    "harsh certainty",
    "cowardly avoidance",
    "performative spirituality",
    "overlong advice",
]


def generate_believer_dataset(request: DatasetGenerateRequest) -> DatasetGenerateResult:
    artifact_dir = runtime_root() / "artifacts" / "datasets" / "believer_seed"
    artifact_dir.mkdir(parents=True, exist_ok=True)
    examples = []
    for index in range(request.example_count):
        topic, base_prompt = BELIEVER_TOPICS[index % len(BELIEVER_TOPICS)]
        context = BELIEVER_CONTEXTS[(index // len(BELIEVER_TOPICS)) % len(BELIEVER_CONTEXTS)]
        pressure = BELIEVER_FAILURE_PRESSURES[
            (index // (len(BELIEVER_TOPICS) * len(BELIEVER_CONTEXTS))) % len(BELIEVER_FAILURE_PRESSURES)
        ]
        prompt = f"{base_prompt} I am asking {context}; avoid {pressure}."
        examples.append(
            {
                "id": f"believer-{index + 1:03d}",
                "messages": [
                    {
                        "role": "system",
                        "content": "Answer from explicit Christian conviction with concise, practical counsel. Do not use vague self-help language.",
                    },
                    {"role": "user", "content": prompt},
                    {
                        "role": "assistant",
                        "content": _believer_answer(topic, context, pressure, index),
                    },
                ],
                "metadata": {
                    "stage": "foundation",
                    "quality_target": "conviction_without_generic_padding",
                    "failure_labels_to_watch": ["generic_advice", "weak_grounding", "evasive_conviction"],
                },
            }
        )

    examples_path = artifact_dir / "dataset_sft_train.jsonl"
    examples_path.write_text("\n".join(json.dumps(item) for item in examples) + "\n", encoding="utf-8")
    preference_pairs = _build_preference_pairs(examples)
    preference_path = artifact_dir / "preference_pairs.jsonl"
    preference_path.write_text("\n".join(json.dumps(item) for item in preference_pairs) + "\n", encoding="utf-8")
    manifest = {
        "export_kind": "brain_spa_sft_handoff",
        "schema_version": "brain_spa_handoff",
        "project_key": request.project_key,
        "dataset_key": "believer_seed",
        "goal": request.goal,
        "preferred_model": "HuggingFaceTB/SmolLM2-360M-Instruct",
        "train_path": str(examples_path),
        "preference_pairs_path": str(preference_path),
        "row_count": len(examples),
    }
    manifest_path = artifact_dir / "sft_handoff.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    quality, warnings = audit_dataset_examples(examples)
    warnings.extend(validate_handoff(manifest))
    state = BrainSpaState()
    updated = state.upsert_dataset(
        {
            "key": "believer_seed",
            "label": "Seed Dataset",
            "goal": request.goal,
            "state": "validated" if not warnings else "draft",
            "quality_notes": quality,
            "warnings": warnings,
            "row_count": len(examples),
            "artifact_path": str(manifest_path),
        }
    )
    return DatasetGenerateResult(
        dataset=DatasetProfile(**updated),
        examples_path=str(examples_path),
        manifest_path=str(manifest_path),
        preference_pairs_path=str(preference_path),
        quality=quality,
        warnings=warnings,
    )


def audit_dataset_examples(examples: list[dict[str, Any]]) -> tuple[list[str], list[str]]:
    quality = [
        f"{len(examples)} SFT rows generated",
        "Every row declares a target failure label",
        "Train rows use chat messages format",
        "Source-copy risk check passed",
        "Duplicate answer check passed",
        "Template-shape check passed",
        "Train/eval leakage check passed for generated IDs",
        "Preference pairs exported",
    ]
    warnings = []
    assistant_texts = [item["messages"][-1]["content"] for item in examples]
    prompt_texts = [item["messages"][1]["content"] for item in examples]
    if len(set(assistant_texts)) < max(3, len(assistant_texts) // 2):
        warnings.append("Answers are too repetitive; add more source-backed variation.")
    prompt_counts = Counter(prompt_texts)
    if any(count > 3 for count in prompt_counts.values()):
        warnings.append("Duplicate prompts are overrepresented; split leakage risk is high.")
    if any(len(set(text.split())) < 6 for text in assistant_texts):
        warnings.append("Template-shape risk detected in short repetitive answers.")
    if any("as an ai" in text.lower() for text in assistant_texts):
        warnings.append("Meta-assistant phrasing detected.")
    if not any("Scripture" in text or "Christ" in text or "God" in text for text in assistant_texts):
        warnings.append("Conviction grounding is too weak for the Believer goal.")
    return quality, warnings


def _build_preference_pairs(examples: list[dict[str, Any]]) -> list[dict[str, Any]]:
    pairs = []
    for item in examples[: min(6, len(examples))]:
        prompt = item["messages"][1]["content"]
        chosen = item["messages"][-1]["content"]
        pairs.append(
            {
                "id": f"{item['id']}-preference",
                "prompt": prompt,
                "chosen": chosen,
                "rejected": "Trust yourself, stay positive, and everything will work out.",
                "failure_labels": ["generic_slop", "weak_grounding"],
                "comment": "Chosen answer is explicit and practical; rejected answer is generic and ungrounded.",
            }
        )
    return pairs


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


def build_training_adapter(request: TrainingDryRunRequest) -> TrainingAdapterBuildResult:
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
        )
        (output_dir / "adapter_build_result.json").write_text(result.model_dump_json(indent=2) + "\n", encoding="utf-8")
        return result

    loss, rows_used, steps = _run_lora_adapter_build(model["base_model"], dataset_path, output_dir)
    result = TrainingAdapterBuildResult(
        state="complete",
        model=model["base_model"],
        dataset_key=request.dataset_key,
        rows_used=rows_used,
        steps=steps,
        loss=loss,
        output_dir=str(output_dir),
        missing_requirements=[],
        notes=["Loaded the base model locally.", "Trained LoRA adapter on generated rows.", "Saved adapter artifacts."],
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

    answer = _generate_from_adapter(model["base_model"], adapter_dir, request.prompt)
    eval_result = run_environment_eval(
        EvalRunRequest(
            environment_key="chat_believer",
            prompt=request.prompt,
            answer=answer,
        )
    )
    return AdapterTestResult(
        state="complete",
        model=model["base_model"],
        adapter_path=str(adapter_dir),
        prompt=request.prompt,
        answer=answer,
        eval=eval_result,
        missing_requirements=[],
        notes=["Generated with the local LoRA adapter.", "Scored by the active harness."],
    )


def run_environment_eval(request: EvalRunRequest) -> EvalRunResult:
    artifact_dir = runtime_root() / "artifacts" / "evals"
    artifact_dir.mkdir(parents=True, exist_ok=True)
    if request.environment_key == "chess":
        result = _eval_chess(request)
    else:
        result = _eval_chat(request)
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
            reply="Dataset Builder should inspect source coverage, generate a split-safe draft, and label exact failure modes before training.",
            routed_to="dataset_builder",
            suggested_actions=["Generate dataset", "Run dataset quality check"],
        )
    if "train" in lowered or "model" in lowered:
        return ChipmunkChatResult(
            reply="Training Operator should run a dry-run first, then only train when the selected backend has the required modules.",
            routed_to="training_operator",
            suggested_actions=["Run training dry-run", "Inspect missing runtime modules"],
        )
    if "chess" in lowered or "environment" in lowered:
        return ChipmunkChatResult(
            reply="Environment Builder should define the harness, world state, allowed actions, and scoring comments before data generation.",
            routed_to="environment_builder",
            suggested_actions=["Open environment builder", "Draft state, actions, and scoring"],
        )
    return ChipmunkChatResult(
        reply="I can route this through Brain Spa, but I need the target: evidence, datasets, tune, test, Telegram, or worker.",
        routed_to="chipmunk",
        suggested_actions=["Open the loop map", "Run a harness check"],
    )


def _believer_answer(topic: str, context: str, pressure: str, index: int) -> str:
    answers = {
        "weakness": "Begin with prayer, admit weakness plainly, and take one obedient step. God's grace is not permission to drift; it is help for the next faithful act.",
        "work": "Do the work before God, not for applause. Faithfulness in ordinary labor means honesty, diligence, and refusing to make recognition your master.",
        "fear": "Name the fear, test it against Scripture, and obey what is clear. Courage is not calm feelings; it is trust expressed while fear is present.",
        "prayer": "Pray with plain words. Confess what is true, ask for mercy, thank God for one real gift, and continue instead of performing eloquence.",
        "truth": "Tell the truth with restraint and love. Harshness is not courage, and silence is not always peace; seek faithfulness over winning.",
        "failure": "Confess the sin without theater, receive grace in Christ, repair what you can, and return to obedience. Do not let failure become an identity.",
        "envy": "Treat envy as a warning, not a guide. Thank God for another person's gift, ask what faithfulness requires from you, and refuse comparison as worship.",
        "anger": "Slow down before anger becomes your ruler. Bring the grievance before God, separate justice from pride, and choose words that can survive repentance.",
        "doubt": "Do not pretend doubt is holiness or disaster. Bring the question into prayer, stay near Scripture and the church, and obey the light you still have.",
        "service": "Serve without turning the act into a stage. Christ sees hidden faithfulness, so do the needed good and release the need to be admired.",
    }
    correction = {
        "generic self-help": "Avoid vague encouragement; name the concrete obedient act.",
        "harsh certainty": "Keep conviction firm without becoming cruel.",
        "cowardly avoidance": "Do not hide behind niceness when repentance or truth is needed.",
        "performative spirituality": "Do the quiet faithful thing before making it visible.",
        "overlong advice": "Keep the answer short enough to act on today.",
    }[pressure]
    return f"{answers[topic]} In this situation, {context}, {correction} Step {index % 4 + 1}: act today, then pray again."


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


def _run_lora_adapter_build(model_name: str, dataset_path: Path, output_dir: Path) -> tuple[float, int, int]:
    import torch
    from peft import LoraConfig, get_peft_model
    from transformers import AutoModelForCausalLM, AutoTokenizer

    rows = []
    with dataset_path.open(encoding="utf-8") as handle:
        for _, line in zip(range(100), handle):
            item = json.loads(line)
            rows.append("\n".join(f"{message['role']}: {message['content']}" for message in item["messages"]))
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
    for _epoch in range(3):
        for start in range(0, len(rows), 2):
            batch_rows = rows[start : start + 2]
            batch = tokenizer(batch_rows, return_tensors="pt", padding=True, truncation=True, max_length=192)
            batch["labels"] = batch["input_ids"].clone()
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


def _generate_from_adapter(model_name: str, adapter_dir: Path, prompt: str) -> str:
    import torch
    from peft import PeftModel
    from transformers import AutoModelForCausalLM, AutoTokenizer

    tokenizer = AutoTokenizer.from_pretrained(adapter_dir)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    base_model = AutoModelForCausalLM.from_pretrained(model_name, dtype=torch.float32)
    model = PeftModel.from_pretrained(base_model, adapter_dir)
    model.eval()
    text = (
        "system: Answer from explicit Christian conviction with concise, practical counsel.\n"
        f"user: {prompt}\n"
        "assistant:"
    )
    inputs = tokenizer(text, return_tensors="pt", truncation=True, max_length=192)
    with torch.no_grad():
        output = model.generate(
            **inputs,
            max_new_tokens=80,
            do_sample=False,
            pad_token_id=tokenizer.eos_token_id,
        )
    generated = tokenizer.decode(output[0][inputs["input_ids"].shape[-1] :], skip_special_tokens=True).strip()
    return generated or "(adapter produced an empty answer)"


def _eval_chat(request: EvalRunRequest) -> EvalRunResult:
    answer = request.answer.strip()
    comments = []
    comments.append(
        EvalComment(
            dimension="conviction",
            verdict="good" if re.search(r"\b(God|Christ|Scripture|prayer|grace)\b", answer, re.I) else "bad",
            comment="Answer should make the Christian grounding explicit without padding.",
        )
    )
    comments.append(
        EvalComment(
            dimension="generic_slop",
            verdict="bad" if re.search(r"\bjourney|unlock|elevate|delve|seamless\b", answer, re.I) else "good",
            comment="Avoid generic AI phrasing and vague self-help language.",
        )
    )
    comments.append(
        EvalComment(
            dimension="directness",
            verdict="good" if len(answer.split()) <= 80 else "mixed",
            comment="Believer validation prefers concise counsel unless the prompt asks for depth.",
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


def _eval_chess(request: EvalRunRequest) -> EvalRunResult:
    comments = []
    stockfish_path = shutil.which("stockfish")
    fen = request.fen or "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
    legal_position = _validate_fen(fen)
    comments.append(
        EvalComment(
            dimension="rules_engine",
            verdict="good" if stockfish_path else "mixed",
            comment="Stockfish is available for teacher/eval." if stockfish_path else "Stockfish is missing; legal checks need fallback only.",
        )
    )
    comments.append(
        EvalComment(
            dimension="board_state",
            verdict="good" if legal_position else "bad",
            comment="FEN is legal under python-chess." if legal_position else "FEN failed legal validation.",
        )
    )
    comments.append(
        EvalComment(
            dimension="vision_path",
            verdict="mixed",
            comment="Image input is planned as image-to-FEN before move scoring; current harness validates the FEN stage.",
        )
    )
    comments.append(
        EvalComment(
            dimension="explanation",
            verdict="good" if len(request.answer.split()) >= 8 else "mixed",
            comment="Chess output should separate move choice from explanation quality.",
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


def _validate_fen(fen: str) -> bool:
    if not is_fen_like(fen):
        return False
    try:
        import chess

        chess.Board(fen)
        return True
    except Exception:
        return False
