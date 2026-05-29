from __future__ import annotations

import json

from fastapi.testclient import TestClient

from apps.api.brainspa_api.config import event_log_path, telegram_config_path
from apps.api.brainspa_api.datasets_workflows import train_jsonl_path
from apps.api.brainspa_api.main import create_app


class FakeTelegramClient:
    def __init__(self, updates: list[dict], sent_message_id: int = 9001):
        self.updates = updates
        self.sent_message_id = sent_message_id
        self.sent_messages: list[dict] = []
        self.offsets: list[int | None] = []

    def get_updates(self, token: str, offset: int | None = None, timeout: int = 0) -> list[dict]:
        self.offsets.append(offset)
        return list(self.updates)

    def send_message(self, token: str, chat_id: str, text: str, reply_to_message_id: int | None = None) -> dict:
        self.sent_messages.append(
            {
                "token": token,
                "chat_id": chat_id,
                "text": text,
                "reply_to_message_id": reply_to_message_id,
            }
        )
        return {"ok": True, "result": {"message_id": self.sent_message_id}}


def test_health_reports_local_brain_spa(monkeypatch, tmp_path):
    monkeypatch.setenv("BRAIN_SPA_HOME", str(tmp_path))
    client = TestClient(create_app())

    response = client.get("/api/health")

    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["product_name"] == "Brain Spa"
    assert payload["local_only"] is True
    assert payload["runtime_root"] == str(tmp_path)


def test_overview_seeds_core_state(monkeypatch, tmp_path):
    monkeypatch.setenv("BRAIN_SPA_HOME", str(tmp_path))
    client = TestClient(create_app())

    response = client.get("/api/overview")

    assert response.status_code == 200
    payload = response.json()
    assert payload["product_name"] == "Brain Spa"
    assert {model["key"] for model in payload["models"]} == {"persona_small", "coding_small"}
    assert {agent["key"] for agent in payload["agents"]} == {"chipmunk"}
    assert {harness["key"] for harness in payload["harnesses"]} == {"evidence", "datasets", "tune", "test"}
    assert "coding_cli" in {environment["key"] for environment in payload["environments"]}
    assert "composer_training_interview" in {source["key"] for source in payload["sources"]}


def test_telegram_bot_token_is_written_but_never_returned(monkeypatch, tmp_path):
    monkeypatch.setenv("BRAIN_SPA_HOME", str(tmp_path))
    client = TestClient(create_app())

    response = client.post(
        "/api/telegram/bots",
        json={
            "name": "Believer Bot",
            "bot_token": "1234567890:abcdefghijklmnopqrstuvwxyz",
            "model_key": "persona_small",
            "allowed_chat_id": "42",
            "enabled": True,
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "name": "Believer Bot",
        "model_key": "persona_small",
        "allowed_chat_id_configured": True,
        "enabled": True,
        "live_verified": False,
    }
    token_file = telegram_config_path()
    assert token_file.exists()
    assert oct(token_file.stat().st_mode & 0o777) == "0o600"
    raw_config = json.loads(token_file.read_text())
    assert raw_config["bots"][0]["bot_token"] == "1234567890:abcdefghijklmnopqrstuvwxyz"
    assert raw_config["bots"][0]["live_verified"] is False


def test_telegram_authorization_enforces_allowed_chat(monkeypatch, tmp_path):
    monkeypatch.setenv("BRAIN_SPA_HOME", str(tmp_path))
    client = TestClient(create_app())
    client.post(
        "/api/telegram/bots",
        json={
            "name": "Believer Bot",
            "bot_token": "1234567890:abcdefghijklmnopqrstuvwxyz",
            "model_key": "persona_small",
            "allowed_chat_id": "42",
            "enabled": True,
        },
    )
    token_file = telegram_config_path()
    raw_config = json.loads(token_file.read_text())
    raw_config["bots"][0]["live_verified"] = True
    token_file.write_text(json.dumps(raw_config), encoding="utf-8")

    rejected = client.post(
        "/api/telegram/authorize",
        json={"bot_name": "Believer Bot", "chat_id": "99", "text": "generate a dataset"},
    )
    accepted = client.post(
        "/api/telegram/authorize",
        json={"bot_name": "Believer Bot", "chat_id": "42", "text": "generate a dataset"},
    )

    assert rejected.status_code == 200
    assert rejected.json()["authorized"] is False
    assert "not allowed" in rejected.json()["reason"]
    assert accepted.status_code == 200
    assert accepted.json()["authorized"] is True
    assert accepted.json()["routed_to"] == "datasets"


def test_telegram_authorization_blocks_unverified_token(monkeypatch, tmp_path):
    monkeypatch.setenv("BRAIN_SPA_HOME", str(tmp_path))
    client = TestClient(create_app())
    client.post(
        "/api/telegram/bots",
        json={
            "name": "Believer Bot",
            "bot_token": "1234567890:abcdefghijklmnopqrstuvwxyz",
            "model_key": "persona_small",
            "allowed_chat_id": "42",
            "enabled": True,
        },
    )

    response = client.post(
        "/api/telegram/authorize",
        json={"bot_name": "Believer Bot", "chat_id": "42", "text": "generate a dataset"},
    )

    assert response.status_code == 200
    assert response.json()["authorized"] is False
    assert "not live-verified" in response.json()["reason"]


def test_telegram_polling_sends_model_reply_for_wired_persona(monkeypatch, tmp_path):
    monkeypatch.setenv("BRAIN_SPA_HOME", str(tmp_path))
    from apps.api.brainspa_api.telegram_runtime import poll_telegram_once

    token_file = telegram_config_path()
    token_file.parent.mkdir(parents=True, exist_ok=True)
    token_file.write_text(
        json.dumps(
            {
                "bots": [
                    {
                        "name": "believer",
                        "bot_token": "1234567890:abcdefghijklmnopqrstuvwxyz",
                        "model_key": "persona_small",
                        "allowed_chat_id": "42",
                        "enabled": True,
                        "live_verified": True,
                    }
                ]
            }
        ),
        encoding="utf-8",
    )
    fake_client = FakeTelegramClient(
        [
            {
                "update_id": 77,
                "message": {
                    "message_id": 10,
                    "chat": {"id": 42},
                    "from": {"id": 42},
                    "text": "What should I do when I envy a friend?",
                },
            }
        ],
        sent_message_id=701,
    )
    monkeypatch.setattr(
        "apps.api.brainspa_api.telegram_runtime.believer_runtime_reply",
        lambda message, model_key="persona_small": type(
            "Reply",
            (),
            {
                "state": "complete",
                "answer": "Confess envy to God and do the next faithful task.",
                "model": "HuggingFaceTB/SmolLM2-360M-Instruct",
                "eval": None,
                "notes": [],
            },
        )(),
    )

    result = poll_telegram_once(client=fake_client)

    assert result.updates_seen == 1
    assert result.messages_sent == 1
    assert result.feedback_saved == 0
    assert fake_client.sent_messages == [
        {
            "token": "1234567890:abcdefghijklmnopqrstuvwxyz",
            "chat_id": "42",
            "text": "Confess envy to God and do the next faithful task.",
            "reply_to_message_id": 10,
        }
    ]


def test_telegram_reply_to_model_output_is_saved_as_evidence_feedback(monkeypatch, tmp_path):
    monkeypatch.setenv("BRAIN_SPA_HOME", str(tmp_path))
    from apps.api.brainspa_api.telegram_runtime import poll_telegram_once, telegram_feedback_path, telegram_messages_path

    token_file = telegram_config_path()
    token_file.parent.mkdir(parents=True, exist_ok=True)
    token_file.write_text(
        json.dumps(
            {
                "bots": [
                    {
                        "name": "believer",
                        "bot_token": "1234567890:abcdefghijklmnopqrstuvwxyz",
                        "model_key": "persona_small",
                        "allowed_chat_id": "42",
                        "enabled": True,
                        "live_verified": True,
                    }
                ]
            }
        ),
        encoding="utf-8",
    )
    telegram_messages_path().parent.mkdir(parents=True, exist_ok=True)
    telegram_messages_path().write_text(
        json.dumps(
            {
                "messages": [
                    {
                        "bot_name": "believer",
                        "chat_id": "42",
                        "user_message_id": 10,
                        "bot_message_id": 701,
                        "model_key": "persona_small",
                        "prompt": "What should I do when I envy a friend?",
                        "answer": "Confess envy to God and do the next faithful task.",
                    }
                ]
            }
        ),
        encoding="utf-8",
    )
    fake_client = FakeTelegramClient(
        [
            {
                "update_id": 78,
                "message": {
                    "message_id": 11,
                    "chat": {"id": 42},
                    "from": {"id": 42},
                    "text": "This is good, but it should mention why comparison is spiritually dangerous.",
                    "reply_to_message": {"message_id": 701},
                },
            }
        ]
    )

    result = poll_telegram_once(client=fake_client)

    assert result.feedback_saved == 1
    assert result.messages_sent == 0
    feedback = [json.loads(line) for line in telegram_feedback_path().read_text(encoding="utf-8").splitlines()]
    assert feedback[-1]["stage"] == "evidence"
    assert feedback[-1]["bot_name"] == "believer"
    assert feedback[-1]["model_key"] == "persona_small"
    assert feedback[-1]["prompt"] == "What should I do when I envy a friend?"
    assert feedback[-1]["answer"] == "Confess envy to God and do the next faithful task."
    assert "comparison is spiritually dangerous" in feedback[-1]["feedback"]


def test_telegram_polling_does_not_reply_twice_to_same_inbound_message(monkeypatch, tmp_path):
    monkeypatch.setenv("BRAIN_SPA_HOME", str(tmp_path))
    from apps.api.brainspa_api.telegram_runtime import poll_telegram_once

    token_file = telegram_config_path()
    token_file.parent.mkdir(parents=True, exist_ok=True)
    token_file.write_text(
        json.dumps(
            {
                "bots": [
                    {
                        "name": "believer",
                        "bot_token": "1234567890:abcdefghijklmnopqrstuvwxyz",
                        "model_key": "persona_small",
                        "allowed_chat_id": "42",
                        "enabled": True,
                        "live_verified": True,
                    }
                ]
            }
        ),
        encoding="utf-8",
    )
    fake_client = FakeTelegramClient(
        [
            {
                "update_id": 77,
                "message": {
                    "message_id": 10,
                    "chat": {"id": 42},
                    "from": {"id": 42},
                    "text": "What should I do when I envy a friend?",
                },
            }
        ]
    )
    monkeypatch.setattr(
        "apps.api.brainspa_api.telegram_runtime.believer_runtime_reply",
        lambda message, model_key="persona_small": type(
            "Reply",
            (),
            {
                "state": "complete",
                "answer": "Confess envy to God and do the next faithful task.",
                "model": "HuggingFaceTB/SmolLM2-360M-Instruct",
                "eval": None,
                "notes": [],
            },
        )(),
    )

    first = poll_telegram_once(client=fake_client)
    second = poll_telegram_once(client=fake_client)

    assert first.messages_sent == 1
    assert second.messages_sent == 0
    assert second.skipped == 1
    assert len(fake_client.sent_messages) == 1


def test_loop_command_sent_to_model_bot_is_not_recorded_as_persona_feedback(monkeypatch, tmp_path):
    monkeypatch.setenv("BRAIN_SPA_HOME", str(tmp_path))
    from apps.api.brainspa_api.telegram_runtime import poll_telegram_once, telegram_messages_path

    token_file = telegram_config_path()
    token_file.parent.mkdir(parents=True, exist_ok=True)
    token_file.write_text(
        json.dumps(
            {
                "bots": [
                    {
                        "name": "believer",
                        "bot_token": "1234567890:abcdefghijklmnopqrstuvwxyz",
                        "model_key": "persona_small",
                        "allowed_chat_id": "42",
                        "enabled": True,
                        "live_verified": True,
                    }
                ]
            }
        ),
        encoding="utf-8",
    )
    fake_client = FakeTelegramClient(
        [
            {
                "update_id": 77,
                "message": {
                    "message_id": 10,
                    "chat": {"id": 42},
                    "from": {"id": 42},
                    "text": "generate a dataset",
                },
            }
        ]
    )

    result = poll_telegram_once(client=fake_client)

    assert result.messages_sent == 1
    assert fake_client.sent_messages[0]["text"].startswith("Datasets harness")
    assert not telegram_messages_path().exists()


def test_telegram_poller_status_endpoint_is_visible(monkeypatch, tmp_path):
    monkeypatch.setenv("BRAIN_SPA_HOME", str(tmp_path))
    monkeypatch.setenv("BRAIN_SPA_DISABLE_TELEGRAM_POLLING", "1")
    client = TestClient(create_app())

    response = client.get("/api/telegram/poller/status")

    assert response.status_code == 200
    assert response.json()["running"] is False
    assert response.json()["last_result"]["updates_seen"] == 0


def test_believer_dataset_generation_writes_handoff(monkeypatch, tmp_path):
    from apps.api.tests.test_datasets_api import _seed_approved_evidence

    monkeypatch.setenv("BRAIN_SPA_HOME", str(tmp_path))
    _seed_approved_evidence(tmp_path)
    client = TestClient(create_app())

    response = client.post(
        "/api/datasets/generate",
        json={"example_count": 24, "ground_in_evidence": True},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["dataset"]["key"] == "believer_seed"
    assert payload["dataset"]["row_count"] == 24
    rows_file = train_jsonl_path("believer_seed")
    sample = json.loads(rows_file.read_text().splitlines()[0])
    assert sample["metadata"]["evidence_claim_ids"]
    assert payload["warnings"] == []
    assert payload["manifest_path"].endswith("sft_handoff.json")
    assert payload["preference_pairs_path"].endswith("preference_pairs.jsonl")
    assert "Source-copy risk check passed" in payload["quality"]


def test_dataset_and_model_lifecycle_transitions_are_explicit(monkeypatch, tmp_path):
    from apps.api.tests.test_datasets_api import _seed_approved_evidence

    monkeypatch.setenv("BRAIN_SPA_HOME", str(tmp_path))
    _seed_approved_evidence(tmp_path)
    client = TestClient(create_app())
    client.post("/api/datasets/generate", json={"example_count": 8, "ground_in_evidence": True})

    dataset = client.post("/api/datasets/believer_seed/state", json={"state": "active"})
    invalid_model = client.post("/api/models/persona_small/state", json={"state": "archived"})
    model = client.post("/api/models/persona_small/state", json={"state": "active"})

    assert dataset.status_code == 200
    assert dataset.json()["state"] == "active"
    assert invalid_model.status_code == 400
    assert "Invalid model transition" in invalid_model.json()["detail"]
    assert model.status_code == 200
    assert model.json()["state"] == "active"
    assert event_log_path().exists()


def test_training_dry_run_reports_missing_runtime_modules(monkeypatch, tmp_path):
    from apps.api.tests.test_datasets_api import _seed_approved_evidence

    monkeypatch.setenv("BRAIN_SPA_HOME", str(tmp_path))
    _seed_approved_evidence(tmp_path)
    client = TestClient(create_app())
    client.post("/api/datasets/generate", json={"example_count": 8, "ground_in_evidence": True})

    response = client.post("/api/training/dry-run", json={})

    assert response.status_code == 200
    payload = response.json()
    assert payload["model"] == "HuggingFaceTB/SmolLM2-360M-Instruct"
    assert payload["backend"] in {"mlx_lm", "unsloth_trl", "transformers_trl"}
    assert len(payload["recipes"]) == 5
    assert "Dry-run only: no model weights were changed." in payload["notes"]


def test_tune_status_lists_models_and_alias_dry_run(monkeypatch, tmp_path):
    from apps.api.tests.test_datasets_api import _seed_approved_evidence

    monkeypatch.setenv("BRAIN_SPA_HOME", str(tmp_path))
    _seed_approved_evidence(tmp_path)
    client = TestClient(create_app())
    client.post("/api/datasets/generate", json={"example_count": 8, "ground_in_evidence": True})

    status = client.get("/api/tune/status")
    assert status.status_code == 200
    models = status.json()["models"]
    believer = next(item for item in models if item["slug"] == "believer")
    assert believer["model_key"] == "persona_small"
    assert believer["display_name"] == "Believer"
    assert believer["adapter_state"] in {"missing", "ready", "blocked", "stale"}
    assert "believer_validation" in believer["adapter_path"]

    slug_status = client.get("/api/tune/believer/status")
    assert slug_status.status_code == 200
    assert slug_status.json()["slug"] == "believer"

    dry_run = client.post("/api/tune/dry-run", json={"model_key": "persona_small", "dataset_key": "believer_seed"})
    assert dry_run.status_code == 200
    assert dry_run.json()["dataset_key"] == "believer_seed"

    preview = client.get("/api/tune/believer/build-preview")
    assert preview.status_code == 200
    assert preview.json()["dataset_display_label"] == "Believer training set"
    assert preview.json()["slug"] == "believer"

    job = client.post(
        "/api/tune/build",
        json={"model_key": "persona_small", "dataset_key": "believer_seed", "training_preset": "fast"},
    )
    assert job.status_code == 200
    assert job.json()["training_preset"] == "fast"
    assert job.json()["state"] in {"running", "complete", "blocked", "failed"}


def test_eval_returns_fine_grained_comments(monkeypatch, tmp_path):
    monkeypatch.setenv("BRAIN_SPA_HOME", str(tmp_path))
    client = TestClient(create_app())

    response = client.post(
        "/api/evals/run",
        json={
            "environment_key": "chat_believer",
            "prompt": "What should I do when weak?",
            "answer": "Pray, read Scripture, and ask God for grace while taking the next obedient step.",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["passed"] is True
    assert {comment["dimension"] for comment in payload["comments"]} == {
        "conviction",
        "generic_slop",
        "directness",
        "role_leak",
        "repetition",
        "fluency",
    }


def test_coding_cli_eval_scores_workspace_and_command_safety(monkeypatch, tmp_path):
    monkeypatch.setenv("BRAIN_SPA_HOME", str(tmp_path))
    client = TestClient(create_app())

    response = client.post(
        "/api/evals/run",
        json={
            "environment_key": "coding_cli",
            "answer": "I would inspect the repo path, make a focused patch, then run npm build or pytest and report the test evidence.",
        },
    )

    assert response.status_code == 200
    dimensions = {comment["dimension"]: comment["verdict"] for comment in response.json()["comments"]}
    assert dimensions["workspace_boundary"] == "good"
    assert dimensions["test_evidence"] == "good"
    assert dimensions["command_safety"] == "good"


def test_hermes_setup_and_hardware_are_visible(monkeypatch, tmp_path):
    monkeypatch.setenv("BRAIN_SPA_HOME", str(tmp_path))
    client = TestClient(create_app())

    setup = client.get("/api/hermes/setup")
    hardware = client.get("/api/hardware")

    assert setup.status_code == 200
    assert setup.json()["repository"] == "https://github.com/NousResearch/hermes-agent"
    assert "TELEGRAM_BOT_TOKEN" in setup.json()["required_env"]
    assert hardware.status_code == 200
    assert "HuggingFaceTB/SmolLM2-360M-Instruct" in hardware.json()["recommended_models"]


def test_settings_loop_and_model_routing(monkeypatch, tmp_path):
    monkeypatch.setenv("BRAIN_SPA_HOME", str(tmp_path))
    client = TestClient(create_app())

    settings = client.get("/api/settings")
    assert settings.status_code == 200
    payload = settings.json()
    assert len(payload["loop_agents"]) == 4
    assert {agent["key"] for agent in payload["loop_agents"]} == {"evidence", "datasets", "tune", "test"}

    patch = client.patch(
        "/api/settings/loop/evidence",
        json={"backend": "opencode", "telegram_bot_name": "notify-evidence"},
    )
    assert patch.status_code == 200
    assert patch.json()["backend"] == "opencode"
    assert patch.json()["telegram_bot_name"] == "notify-evidence"

    model_patch = client.patch(
        "/api/settings/models/persona_small/telegram",
        json={"telegram_bot_name": "chipmunk"},
    )
    assert model_patch.status_code == 200
    assert model_patch.json()["telegram_bot_name"] == "chipmunk"


def test_worker_preview_and_chipmunk_routing(monkeypatch, tmp_path):
    monkeypatch.setenv("BRAIN_SPA_HOME", str(tmp_path))
    client = TestClient(create_app())

    worker = client.post(
        "/api/workers/run",
        json={"agent_key": "datasets", "backend": "codex", "task": "audit believer dataset"},
    )
    chipmunk = client.post("/api/chipmunk/chat", json={"message": "generate a dataset"})

    assert worker.status_code == 200
    assert worker.json()["agent_key"] == "datasets"
    assert chipmunk.status_code == 200
    assert chipmunk.json()["routed_to"] == "datasets"


def test_harness_chat_generates_and_reply_saves_feedback(monkeypatch, tmp_path):
    monkeypatch.setenv("BRAIN_SPA_HOME", str(tmp_path))
    from apps.api.brainspa_api.config import model_feedback_path
    from apps.api.brainspa_api.models import AdapterTestResult, EvalRunResult

    def fake_reply(message, model_key="persona_small", **kwargs):
        return AdapterTestResult(
            state="complete",
            model="HuggingFaceTB/SmolLM2-360M-Instruct",
            adapter_path=str(tmp_path / "adapter"),
            prompt=message,
            answer=f"Model reply to: {message}",
            eval=EvalRunResult(
                environment_key="chat_believer",
                score=0.8,
                passed=True,
                comments=[],
                artifact_path="",
            ),
            missing_requirements=[],
            notes=[],
        )

    monkeypatch.setattr("apps.api.brainspa_api.harness_chat.believer_runtime_reply", fake_reply)
    client = TestClient(create_app())

    first = client.post(
        "/api/harness/chat/send",
        json={
            "model_key": "persona_small",
            "scenario_key": "counsel",
            "text": "What do you think about God?",
        },
    )
    assert first.status_code == 200
    first_payload = first.json()
    assert first_payload["kind"] == "assistant_reply"
    assistant_id = first_payload["message"]["id"]

    thread = client.get("/api/harness/chat/persona_small/counsel")
    assert thread.status_code == 200
    assert len(thread.json()["messages"]) >= 2

    feedback = client.post(
        "/api/harness/chat/send",
        json={
            "model_key": "persona_small",
            "scenario_key": "counsel",
            "text": "Answer the question directly instead of deflecting.",
            "reply_to_message_id": assistant_id,
        },
    )
    assert feedback.status_code == 200
    assert feedback.json()["feedback_recorded"] is True

    records = [json.loads(line) for line in model_feedback_path().read_text(encoding="utf-8").splitlines()]
    assert records[-1]["source"] == "harness_chat_reply_feedback"
    assert records[-1]["prompt"] == "What do you think about God?"
    assert "Model reply to:" in records[-1]["answer"]
