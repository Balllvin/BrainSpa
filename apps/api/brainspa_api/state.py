from __future__ import annotations

import json
import sqlite3
import ssl
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from packages.brainspa_core.lifecycle import DATASET_STATES, MODEL_STATES

import os
import re

from .config import (
    ensure_runtime_dirs,
    event_log_path,
    legacy_telegram_config_paths,
    state_path,
    telegram_config_path,
    write_private_json,
    xai_api_key_path,
)
from .models import (
    AgentProfile,
    DatasetProfile,
    EnvironmentProfile,
    HarnessProfile,
    ModelProfile,
    ProjectProfile,
    SourceProfile,
    TelegramBotCreate,
    TelegramBotPublic,
)


def seed_state() -> dict[str, Any]:
    return {
        "agents": [
            {
                "key": "chipmunk",
                "label": "Chipmunk",
                "goal": "Coordinate the Evidence, Datasets, Tune, and Test harnesses through Hermes, in-app chat, and Telegram while keeping the user in control.",
                "default_backend": "hermes",
                "allowed_backends": ["hermes", "codex", "opencode", "grok", "cursor"],
                "validation": ["Read loop state", "Choose the right harness", "Report exact blockers", "Keep Telegram access locked to the configured chat"],
            },
        ],
        "harnesses": [
            {
                "key": "evidence",
                "label": "Evidence Harness",
                "owner": "Source Model",
                "purpose": "Find reliable proof for the target behavior before any training rows are written.",
                "default_backend": "grok",
                "world_state": [
                    "source registry",
                    "interview transcripts",
                    "web and X search notes",
                    "behavior claims",
                    "citation and provenance ledger",
                ],
                "allowed_actions": [
                    "search public web",
                    "search X when Grok is connected",
                    "extract transcript evidence",
                    "write source notes",
                    "flag weak or unsupported claims",
                ],
                "tools": ["grok", "web search", "X search", "transcript reader", "source ledger"],
                "scoring_rules": ["provenance present", "claim supported", "source-copy risk low", "behavior signal specific"],
                "failure_comments": ["missing citation", "vague behavior claim", "source says less than the row requires"],
                "template_artifacts": ["evidence_notes.json", "source_claims.jsonl", "evidence_manifest.json"],
            },
            {
                "key": "datasets",
                "label": "Datasets Harness",
                "owner": "Data Model",
                "purpose": "Turn approved evidence into SFT rows and preference pairs without copying source text or creating jagged behavior.",
                "default_backend": "opencode",
                "world_state": [
                    "approved evidence",
                    "dataset state",
                    "row schema",
                    "preference pair schema",
                    "train/eval split ledger",
                ],
                "allowed_actions": [
                    "generate SFT rows",
                    "generate rejected answers",
                    "audit duplicates",
                    "audit source-copy risk",
                    "write handoff manifests",
                ],
                "tools": ["opencode", "JSONL writer", "dataset auditor", "handoff validator"],
                "scoring_rules": ["row grounded", "answer varied", "split-safe", "failure label explicit"],
                "failure_comments": ["template repetition", "generic answer", "copied source language", "missing failure label"],
                "template_artifacts": ["dataset_sft_train.jsonl", "preference_pairs.jsonl", "sft_handoff.json"],
            },
            {
                "key": "tune",
                "label": "Tune Harness",
                "owner": "Training Model",
                "purpose": "Dry-run, fine-tune, and register adapter artifacts for the selected base model and dataset.",
                "default_backend": "codex",
                "world_state": [
                    "model registry",
                    "dataset manifest",
                    "trainer recipes",
                    "local hardware profile",
                    "adapter artifact directory",
                ],
                "allowed_actions": [
                    "probe runtime modules",
                    "write trainer recipes",
                    "run LoRA adapter training",
                    "register adapter artifacts",
                    "record missing requirements",
                ],
                "tools": ["codex", "transformers", "TRL", "PEFT", "MLX recipe writer", "artifact registry"],
                "scoring_rules": ["dry-run complete", "requirements explicit", "adapter saved", "base model unchanged"],
                "failure_comments": ["missing trainer module", "dataset handoff invalid", "adapter artifact missing", "loss unavailable"],
                "template_artifacts": ["dry_run.json", "trainer_recipes", "adapter_build_result.json", "believer_adapter"],
            },
            {
                "key": "test",
                "label": "Test Harness",
                "owner": "Harness Model",
                "purpose": "Build task environments and score whether the tuned model behaves correctly inside each world.",
                "default_backend": "codex",
                "world_state": [
                    "environment registry",
                    "allowed tool list",
                    "task prompts",
                    "model outputs",
                    "score artifacts",
                ],
                "allowed_actions": [
                    "create chat environments",
                    "create coding environments",
                    "score model answers",
                    "record eval comments",
                    "convert misses into dataset requirements",
                ],
                "tools": ["codex", "browser harness", "CLI sandbox", "chat page", "scoring runner"],
                "scoring_rules": ["world realistic", "allowed actions clear", "score reproducible", "failure comment actionable"],
                "failure_comments": ["environment too vague", "tool boundary unclear", "score cannot be reproduced", "jagged answer"],
                "template_artifacts": ["environment_spec.json", "eval_result.json", "acceptance_report.json"],
            },
        ],
        "models": [
            {
                "key": "persona_small",
                "label": "Believer",
                "base_model": "HuggingFaceTB/SmolLM2-360M-Instruct",
                "role": "Small persona and chatbot fine-tunes",
                "state": "candidate",
                "parameter_count": "360M",
                "hardware_fit": "Recommended for the current local-first target.",
                "strengths": ["Small", "Apache licensed", "Practical for fast local iteration"],
                "known_failures": ["Needs task-specific data for strong domain behavior"],
            },
            {
                "key": "coding_small",
                "label": "Coding Small",
                "base_model": "Qwen/Qwen2.5-Coder-0.5B-Instruct",
                "role": "Small coding-worker experiments",
                "state": "candidate",
                "parameter_count": "0.5B",
                "hardware_fit": "Useful when the goal is code-specific behavior under a small-model budget.",
                "strengths": ["Code-specialized", "Small", "Strong candidate for worker datasets"],
                "known_failures": ["Less suitable as the default persona model"],
            },
        ],
        "datasets": [
            {
                "key": "believer_seed",
                "label": "Believer training set",
                "goal": "Validate the full Brain Spa loop with a small model that answers from explicit Christian conviction.",
                "state": "draft",
                "quality_notes": ["Needs source material", "Needs split-safe eval set", "Needs failure labels"],
                "warnings": ["Not ready for training"],
            }
        ],
        "projects": [
            {
                "key": "believer_validation",
                "label": "Believer Validation",
                "goal": "End-to-end local validation for dataset generation, training handoff, model registry, and Telegram chat.",
                "active_model": "persona_small",
                "active_dataset": "believer_seed",
                "environment": "chat_believer",
            },
            {
                "key": "coding_environment",
                "label": "Coding Environment",
                "goal": "Validate CLI and file-editing behavior for models intended to operate in a coding harness.",
                "active_model": "coding_small",
                "active_dataset": None,
                "environment": "coding_cli",
            },
        ],
        "sources": [
            {
                "key": "believer_voice_refs",
                "label": "Believer Voice References",
                "kind": "web",
                "provenance": "Faith-forward interviews, sermons, and blunt pastoral tone references",
                "summary": "Ground Believer persona in cited faith voice—not generic assistant hedging.",
                "active": True,
                "feeds_models": ["persona_small", "believer"],
            },
            {
                "key": "composer_training_interview",
                "label": "Composer Training Interview",
                "kind": "transcript",
                "provenance": "docs/Composer 2 and 2.5 training interview.docx",
                "summary": "Guidance source for fine-grained training comments, environment loops, and reward design.",
                "active": True,
                "feeds_models": [],
            },
            {
                "key": "recovery_commits",
                "label": "Recovered Repository History",
                "kind": "source_recovery",
                "provenance": "GitHub commit history for Brain Spa source, data workflows, training source, and harness recovery.",
                "summary": "Source map for transcript ingestion, training handoff validation, Telegram persona running, and custom harnesses.",
                "active": True,
                "feeds_models": [],
            },
        ],
        "environments": [
            {
                "key": "chat_believer",
                "label": "Believer Chat Harness",
                "goal": "Test whether the model answers from the intended conviction without generic or evasive phrasing.",
                "harness": "Single-turn and short multi-turn chat",
                "scoring": ["Conviction fit", "Grounding", "Boundary clarity", "Non-generic wording"],
            },
            {
                "key": "coding_cli",
                "label": "Coding CLI Harness",
                "goal": "Test whether a coder model can inspect files, edit safely, run commands, and explain failures.",
                "harness": "Repository workspace with shell, file operations, tests, and strict allowed-action boundaries",
                "scoring": ["Patch correctness", "Test evidence", "Command safety", "Failure explanation"],
            },
        ],
    }


class BrainSpaState:
    def __init__(self, path: Path | None = None) -> None:
        self.path = path or state_path()

    def load(self) -> dict[str, Any]:
        ensure_runtime_dirs()
        if not self.path.exists():
            self.save(seed_state())
        payload = json.loads(self.path.read_text(encoding="utf-8"))
        seed = seed_state()
        changed = False
        if payload.get("agents") != seed["agents"]:
            payload["agents"] = seed["agents"]
            changed = True
        if payload.get("harnesses") != seed["harnesses"]:
            payload["harnesses"] = seed["harnesses"]
            changed = True
        if payload.get("environments") != seed["environments"]:
            payload["environments"] = seed["environments"]
            changed = True
        seed_sources = {item["key"]: item for item in seed["sources"]}
        existing_source_keys = {item["key"] for item in payload.get("sources", [])}
        for key, source in seed_sources.items():
            if key not in existing_source_keys:
                payload.setdefault("sources", []).append(source)
                changed = True
        for item in payload.get("sources", []):
            seed_item = seed_sources.get(item.get("key", ""))
            if seed_item and "feeds_models" not in item:
                item["feeds_models"] = list(seed_item.get("feeds_models", []))
                changed = True
        for key, value in seed.items():
            if key not in payload:
                payload[key] = value
                changed = True
        if changed:
            self.save(payload)
        return payload

    def save(self, payload: dict[str, Any]) -> None:
        ensure_runtime_dirs()
        self.path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")

    def agents(self) -> list[AgentProfile]:
        return [AgentProfile(**item) for item in self.load()["agents"]]

    def harnesses(self) -> list[HarnessProfile]:
        return [HarnessProfile(**item) for item in self.load()["harnesses"]]

    def projects(self) -> list[ProjectProfile]:
        return [ProjectProfile(**item) for item in self.load()["projects"]]

    def sources(self) -> list[SourceProfile]:
        return [SourceProfile(**item) for item in self.load()["sources"]]

    def models(self) -> list[ModelProfile]:
        return [ModelProfile(**item) for item in self.load()["models"]]

    def datasets(self) -> list[DatasetProfile]:
        return [DatasetProfile(**item) for item in self.load()["datasets"]]

    def environments(self) -> list[EnvironmentProfile]:
        return [EnvironmentProfile(**item) for item in self.load()["environments"]]

    def upsert_dataset(self, dataset: dict[str, Any]) -> dict[str, Any]:
        payload = self.load()
        payload["datasets"] = [item for item in payload["datasets"] if item["key"] != dataset["key"]]
        payload["datasets"].append(dataset)
        self.save(payload)
        log_event("dataset.upsert", dataset["key"], {"state": dataset["state"], "row_count": dataset.get("row_count", 0)})
        return dataset

    def update_dataset_state(self, key: str, next_state: str) -> dict[str, Any]:
        payload = self.load()
        dataset = _find_by_key(payload["datasets"], key, "dataset")
        current = dataset["state"]
        _assert_transition("dataset", current, next_state)
        dataset["state"] = next_state
        self.save(payload)
        log_event("dataset.lifecycle", key, {"from": current, "to": next_state})
        return dataset

    def update_model_state(self, key: str, next_state: str) -> dict[str, Any]:
        payload = self.load()
        model = _find_by_key(payload["models"], key, "model")
        current = model["state"]
        _assert_transition("model", current, next_state)
        model["state"] = next_state
        self.save(payload)
        log_event("model.lifecycle", key, {"from": current, "to": next_state})
        return model


def _find_by_key(items: list[dict[str, Any]], key: str, label: str) -> dict[str, Any]:
    for item in items:
        if item["key"] == key:
            return item
    raise KeyError(f"Unknown {label}: {key}")


def _assert_transition(kind: str, current: str, next_state: str) -> None:
    transitions = {
        "dataset": {
            "draft": {"validated", "retired"},
            "validated": {"active", "draft", "retired"},
            "active": {"retired", "archived"},
            "retired": {"archived", "validated"},
            "archived": set(),
        },
        "model": {
            "candidate": {"active", "failed", "retired"},
            "active": {"failed", "retired", "archived"},
            "failed": {"candidate", "retired", "archived"},
            "retired": {"candidate", "archived"},
            "archived": set(),
        },
    }[kind]
    allowed_states = DATASET_STATES if kind == "dataset" else MODEL_STATES
    if next_state not in allowed_states:
        raise ValueError(f"Unknown {kind} state: {next_state}")
    if next_state not in transitions.get(current, set()):
        raise ValueError(f"Invalid {kind} transition: {current} -> {next_state}")


def init_event_log() -> None:
    ensure_runtime_dirs()
    with sqlite3.connect(event_log_path()) as connection:
        connection.execute(
            """
            create table if not exists events (
                id integer primary key autoincrement,
                kind text not null,
                target_key text not null,
                payload_json text not null
            )
            """
        )


def log_event(kind: str, target_key: str, payload: dict[str, Any]) -> None:
    init_event_log()
    with sqlite3.connect(event_log_path()) as connection:
        connection.execute(
            "insert into events (kind, target_key, payload_json) values (?, ?, ?)",
            (kind, target_key, json.dumps(payload, sort_keys=True)),
        )


def event_log_exists() -> bool:
    init_event_log()
    return event_log_path().exists()


def _slug_bot_name(label: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", label.lower()).strip("-")
    return slug or "telegram-bot"


def migrate_legacy_telegram_bots() -> int:
    """Import bots from ~/.brain-spa-runtime format into canonical secrets file."""
    path = telegram_config_path()
    existing: list[dict[str, Any]] = []
    if path.exists():
        raw = json.loads(path.read_text(encoding="utf-8"))
        bots_field = raw.get("bots", [])
        if isinstance(bots_field, list) and bots_field:
            return 0
        if isinstance(bots_field, list):
            existing = bots_field

    imported: list[dict[str, Any]] = []
    for legacy_path in legacy_telegram_config_paths():
        legacy = json.loads(legacy_path.read_text(encoding="utf-8"))
        legacy_bots = legacy.get("bots", {})
        if isinstance(legacy_bots, dict):
            for _id, item in legacy_bots.items():
                if not isinstance(item, dict):
                    continue
                token = item.get("bot_token") or item.get("token")
                if not token:
                    continue
                label = str(item.get("project_name") or item.get("name") or f"bot-{_id}")
                name = _slug_bot_name(label)
                model_key = "persona_small"
                if "coding" in label.lower():
                    model_key = "coding_small"
                imported.append(
                    {
                        "name": name,
                        "bot_token": token,
                        "model_key": model_key,
                        "allowed_chat_id": str(item.get("allowed_chat_id") or ""),
                        "enabled": bool(item.get("enabled", True)),
                        "live_verified": validate_telegram_token(str(token)),
                        "legacy_label": label,
                    }
                )

    if not imported:
        return 0

    names = {item["name"] for item in existing}
    merged = list(existing)
    for item in imported:
        if item["name"] in names:
            continue
        merged.append(item)
        names.add(item["name"])
    write_private_json(path, {"bots": merged})
    return len(merged) - len(existing)


def read_telegram_bots() -> list[TelegramBotPublic]:
    migrate_legacy_telegram_bots()
    path = telegram_config_path()
    if not path.exists():
        return []
    data = json.loads(path.read_text(encoding="utf-8"))
    bots_field = data.get("bots", [])
    if isinstance(bots_field, dict):
        bots_field = list(bots_field.values())
    bots = []
    for item in bots_field:
        if not isinstance(item, dict):
            continue
        bots.append(
            TelegramBotPublic(
                name=item["name"],
                model_key=item.get("model_key", "persona_small"),
                allowed_chat_id_configured=bool(item.get("allowed_chat_id")),
                enabled=bool(item.get("enabled", True)),
                live_verified=bool(item.get("live_verified")),
            )
        )
    return bots


def get_xai_api_key() -> str | None:
    path = xai_api_key_path()
    if path.exists():
        value = path.read_text(encoding="utf-8").strip()
        if value:
            return value
    env = os.environ.get("XAI_API_KEY", "").strip()
    return env or None


def set_xai_api_key(api_key: str) -> None:
    ensure_runtime_dirs()
    path = xai_api_key_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(api_key.strip() + "\n", encoding="utf-8")
    os.chmod(path, 0o600)


def clear_xai_api_key() -> None:
    path = xai_api_key_path()
    if path.exists():
        path.unlink()


def add_telegram_bot(bot: TelegramBotCreate) -> TelegramBotPublic:
    path = telegram_config_path()
    if path.exists():
        data = json.loads(path.read_text(encoding="utf-8"))
    else:
        data = {"bots": []}

    bot_record = {
        "name": bot.name,
        "bot_token": bot.bot_token,
        "model_key": bot.model_key,
        "allowed_chat_id": bot.allowed_chat_id,
        "enabled": bot.enabled,
        "live_verified": validate_telegram_token(bot.bot_token),
    }
    data["bots"] = [item for item in data.get("bots", []) if item.get("name") != bot.name]
    data["bots"].append(bot_record)
    write_private_json(path, data)
    return TelegramBotPublic(
        name=bot.name,
        model_key=bot.model_key,
        allowed_chat_id_configured=bool(bot.allowed_chat_id),
        enabled=bot.enabled,
        live_verified=bot_record["live_verified"],
    )


def authorize_telegram_message(bot_name: str, chat_id: str) -> tuple[bool, str]:
    if not bot_name:
        return False, "No Telegram bot selected."
    path = telegram_config_path()
    if not path.exists():
        return False, "No Telegram bots have been configured."
    data = json.loads(path.read_text(encoding="utf-8"))
    for item in data.get("bots", []):
        if item.get("name") != bot_name:
            continue
        if not item.get("enabled"):
            return False, "Bot is configured but disabled."
        if not item.get("live_verified"):
            return False, "Bot token is saved but not live-verified."
        allowed = item.get("allowed_chat_id")
        if not allowed:
            return False, "Allowed chat ID is not configured yet."
        if str(allowed) != str(chat_id):
            return False, "Message rejected: chat ID is not allowed."
        return True, "Authorized Telegram route."
    return False, f"Unknown bot: {bot_name}"


def telegram_bot_model_key(bot_name: str) -> str | None:
    path = telegram_config_path()
    if not path.exists():
        return None
    data = json.loads(path.read_text(encoding="utf-8"))
    for item in data.get("bots", []):
        if item.get("name") == bot_name:
            return str(item.get("model_key") or "persona_small")
    return None


def validate_telegram_token(token: str) -> bool:
    if ":" not in token:
        return False
    prefix, suffix = token.split(":", 1)
    if not prefix.isdigit() or len(suffix) < 30:
        return False
    try:
        with urllib.request.urlopen(
            f"https://api.telegram.org/bot{token}/getMe",
            timeout=2,
            context=_ssl_context(),
        ) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (OSError, urllib.error.URLError, json.JSONDecodeError):
        return False
    return bool(payload.get("ok"))


def _ssl_context() -> ssl.SSLContext:
    try:
        import certifi

        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        return ssl.create_default_context()
