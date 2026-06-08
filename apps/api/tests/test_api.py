from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

from fastapi.testclient import TestClient

from apps.api.brainspa_api.config import event_log_path, telegram_config_path
from apps.api.brainspa_api.datasets_workflows import train_jsonl_path
from apps.api.brainspa_api.main import create_app


def test_env_file_can_set_runtime_home_for_local_process(tmp_path):
    env_home = tmp_path / "brain-home"
    (tmp_path / ".env").write_text(f"BRAIN_SPA_HOME={env_home}\n", encoding="utf-8")
    repo_root = str(Path(__file__).resolve().parents[3])
    env = {**os.environ, "PYTHONPATH": repo_root}
    env.pop("BRAIN_SPA_HOME", None)

    result = subprocess.run(
        [
            sys.executable,
            "-c",
            "from apps.api.brainspa_api.config import runtime_root; print(runtime_root())",
        ],
        cwd=tmp_path,
        env=env,
        text=True,
        capture_output=True,
        check=False,
    )

    assert result.returncode == 0
    assert result.stdout.strip() == str(env_home)


class FakeTelegramClient:
    def __init__(self, updates: list[dict], sent_message_id: int = 9001):
        self.updates = updates
        self.sent_message_id = sent_message_id
        self.sent_messages: list[dict] = []
        self.offsets: list[int | None] = []

    def get_updates(self, token: str, offset: int | None = None, timeout: int = 0) -> list[dict]:
        self.offsets.append(offset)
        if offset is None:
            return list(self.updates)
        return [update for update in self.updates if int(update.get("update_id", -1)) >= offset]

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
    assert {model["key"] for model in payload["models"]} == {"snake_policy"}
    assert {agent["key"] for agent in payload["agents"]} == {"chipmunk"}
    assert {harness["key"] for harness in payload["harnesses"]} == {"evidence", "datasets", "tune", "test"}
    assert {environment["key"] for environment in payload["environments"]} == {"snake_10x10"}
    assert payload["sources"] == []


def test_telegram_bot_token_is_written_but_never_returned(monkeypatch, tmp_path):
    monkeypatch.setenv("BRAIN_SPA_HOME", str(tmp_path))
    client = TestClient(create_app())

    response = client.post(
        "/api/telegram/bots",
        json={
            "name": "Snake Bot",
            "bot_token": "1234567890:abcdefghijklmnopqrstuvwxyz",
            "model_key": "snake_policy",
            "allowed_chat_id": "42",
            "enabled": True,
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "name": "Snake Bot",
        "model_key": "snake_policy",
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
            "name": "Snake Bot",
            "bot_token": "1234567890:abcdefghijklmnopqrstuvwxyz",
            "model_key": "snake_policy",
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
        json={"bot_name": "Snake Bot", "chat_id": "99", "text": "generate a dataset"},
    )
    accepted = client.post(
        "/api/telegram/authorize",
        json={"bot_name": "Snake Bot", "chat_id": "42", "text": "generate a dataset"},
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
            "name": "Snake Bot",
            "bot_token": "1234567890:abcdefghijklmnopqrstuvwxyz",
            "model_key": "snake_policy",
            "allowed_chat_id": "42",
            "enabled": True,
        },
    )

    response = client.post(
        "/api/telegram/authorize",
        json={"bot_name": "Snake Bot", "chat_id": "42", "text": "generate a dataset"},
    )

    assert response.status_code == 200
    assert response.json()["authorized"] is False
    assert "not live-verified" in response.json()["reason"]


def test_telegram_polling_blocks_freeform_chat_for_policy_bot(monkeypatch, tmp_path):
    monkeypatch.setenv("BRAIN_SPA_HOME", str(tmp_path))
    from apps.api.brainspa_api.telegram_runtime import poll_telegram_once

    token_file = telegram_config_path()
    token_file.parent.mkdir(parents=True, exist_ok=True)
    token_file.write_text(
        json.dumps(
            {
                "bots": [
                    {
                        "name": "snake",
                        "bot_token": "1234567890:abcdefghijklmnopqrstuvwxyz",
                        "model_key": "snake_policy",
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

    result = poll_telegram_once(client=fake_client)

    assert result.updates_seen == 1
    assert result.messages_sent == 1
    assert result.feedback_saved == 0
    assert fake_client.sent_messages == [
        {
            "token": "1234567890:abcdefghijklmnopqrstuvwxyz",
            "chat_id": "42",
            "text": "Snake Policy is an environment policy, not a shipped chat model. Use the Snake Test pages to run or train it.",
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
                        "name": "snake",
                        "bot_token": "1234567890:abcdefghijklmnopqrstuvwxyz",
                        "model_key": "snake_policy",
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
                        "bot_name": "snake",
                        "chat_id": "42",
                        "user_message_id": 10,
                        "bot_message_id": 701,
                        "model_key": "snake_policy",
                        "prompt": "The snake saw an apple two cells above its head.",
                        "answer": "Move straight toward the apple unless the next cell is a wall or body collision.",
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
                    "text": "This is good, but it should mention collision risk before chasing the apple.",
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
    assert feedback[-1]["bot_name"] == "snake"
    assert feedback[-1]["model_key"] == "snake_policy"
    assert feedback[-1]["prompt"] == "The snake saw an apple two cells above its head."
    assert feedback[-1]["answer"] == "Move straight toward the apple unless the next cell is a wall or body collision."
    assert "collision risk" in feedback[-1]["feedback"]


def test_telegram_polling_does_not_reply_twice_to_same_policy_message(monkeypatch, tmp_path):
    monkeypatch.setenv("BRAIN_SPA_HOME", str(tmp_path))
    from apps.api.brainspa_api.telegram_runtime import poll_telegram_once

    token_file = telegram_config_path()
    token_file.parent.mkdir(parents=True, exist_ok=True)
    token_file.write_text(
        json.dumps(
            {
                "bots": [
                    {
                        "name": "snake",
                        "bot_token": "1234567890:abcdefghijklmnopqrstuvwxyz",
                        "model_key": "snake_policy",
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

    first = poll_telegram_once(client=fake_client)
    second = poll_telegram_once(client=fake_client)

    assert first.messages_sent == 1
    assert second.messages_sent == 0
    assert second.skipped == 0
    assert len(fake_client.sent_messages) == 1


def test_loop_command_sent_to_model_bot_is_not_recorded_as_policy_feedback(monkeypatch, tmp_path):
    monkeypatch.setenv("BRAIN_SPA_HOME", str(tmp_path))
    from apps.api.brainspa_api.telegram_runtime import poll_telegram_once, telegram_messages_path

    token_file = telegram_config_path()
    token_file.parent.mkdir(parents=True, exist_ok=True)
    token_file.write_text(
        json.dumps(
            {
                "bots": [
                    {
                        "name": "snake",
                        "bot_token": "1234567890:abcdefghijklmnopqrstuvwxyz",
                        "model_key": "snake_policy",
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
    assert fake_client.sent_messages[0]["text"].startswith("Dataset generation is not seeded")
    assert "Snake autonomous train" in fake_client.sent_messages[0]["text"]
    assert not telegram_messages_path().exists()


def test_configured_chipmunk_telegram_bot_is_reserved_for_hermes(monkeypatch, tmp_path):
    monkeypatch.setenv("BRAIN_SPA_HOME", str(tmp_path))
    from apps.api.brainspa_api.telegram_runtime import poll_telegram_once

    token_file = telegram_config_path()
    token_file.parent.mkdir(parents=True, exist_ok=True)
    token_file.write_text(
        json.dumps(
            {
                "bots": [
                    {
                        "name": "chipmunk",
                        "bot_token": "1234567890:abcdefghijklmnopqrstuvwxyz",
                        "model_key": "snake_policy",
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
                "update_id": 80,
                "message": {
                    "message_id": 12,
                    "chat": {"id": 42},
                    "from": {"id": 42},
                    "text": "status",
                },
            }
        ]
    )

    result = poll_telegram_once(client=fake_client)

    assert result.messages_sent == 0
    assert result.skipped == 1
    assert fake_client.sent_messages == []


def test_chipmunk_telegram_api_rejects_custom_bot(monkeypatch, tmp_path):
    monkeypatch.setenv("BRAIN_SPA_HOME", str(tmp_path))
    client = TestClient(create_app())

    response = client.post(
        "/api/telegram/bots",
        json={
            "name": "chipmunk",
            "bot_token": "1234567890:abcdefghijklmnopqrstuvwxyz",
            "model_key": "snake_policy",
            "allowed_chat_id": "42",
            "enabled": True,
        },
    )

    assert response.status_code == 400
    assert "official Hermes gateway" in response.json()["detail"]


def test_telegram_poller_status_endpoint_is_visible(monkeypatch, tmp_path):
    monkeypatch.setenv("BRAIN_SPA_HOME", str(tmp_path))
    monkeypatch.setenv("BRAIN_SPA_DISABLE_TELEGRAM_POLLING", "1")
    client = TestClient(create_app())

    response = client.get("/api/telegram/poller/status")

    assert response.status_code == 200
    assert response.json()["running"] is False
    assert response.json()["last_result"]["updates_seen"] == 0


def test_settings_reports_official_chipmunk_hermes_profile(monkeypatch, tmp_path):
    home = tmp_path / "home"
    profile = home / ".hermes" / "profiles" / "chipmunk"
    profile.mkdir(parents=True)
    (profile / "config.yaml").write_text(
        "\n".join(
            [
                "model:",
                '  default: "gpt-5.5"',
                "  provider: openai-codex",
                '  base_url: "https://chatgpt.com/backend-api/codex"',
                "agent:",
                "  reasoning_effort: high",
                "  service_tier: normal",
                "  max_turns: 25",
                "  gateway_timeout: 120",
                "terminal:",
                f"  cwd: {tmp_path}",
                "toolsets:",
                "  - hermes-cli",
                "platform_toolsets:",
                "  telegram: [hermes-telegram]",
                "skills:",
                "  external_dirs:",
                f"    - {tmp_path / 'skills'}",
                "",
            ]
        ),
        encoding="utf-8",
    )
    (profile / ".env").write_text(
        "TELEGRAM_BOT_TOKEN=1234567890:abcdefghijklmnopqrstuvwxyz\nTELEGRAM_ALLOWED_USERS=42\nXAI_API_KEY=xai-test\n",
        encoding="utf-8",
    )
    (profile / "auth.json").write_text(
        json.dumps({"providers": {}, "credential_pool": {"openai-codex": [{"type": "oauth"}]}}),
        encoding="utf-8",
    )

    def fake_run(*args, **kwargs):
        return subprocess.CompletedProcess(
            args=args[0],
            returncode=0,
            stdout="state = running\npid = 4242\nlast exit code = 0\n",
            stderr="",
        )

    monkeypatch.setenv("BRAIN_SPA_HOME", str(tmp_path / "runtime"))
    monkeypatch.setenv("HOME", str(home))
    monkeypatch.setenv("BRAIN_SPA_DISABLE_TELEGRAM_POLLING", "1")
    monkeypatch.setattr("apps.api.brainspa_api.chipmunk_hermes.subprocess.run", fake_run)
    client = TestClient(create_app())

    response = client.get("/api/settings")

    assert response.status_code == 200
    hermes = response.json()["chipmunk"]["hermes"]
    assert hermes["gateway_running"] is True
    assert hermes["gateway_pid"] == 4242
    assert hermes["provider"] == "openai-codex"
    assert hermes["model"] == "gpt-5.5"
    assert hermes["reasoning_effort"] == "high"
    assert hermes["service_tier"] == "normal"
    assert hermes["telegram_token_configured"] is True
    assert hermes["telegram_allowed_users"] == "42"
    assert hermes["openai_codex_configured"] is True
    assert hermes["xai_api_key_synced"] is True
    assert hermes["toolsets"] == ["hermes-cli"]
    assert hermes["telegram_toolsets"] == ["hermes-telegram"]
    openai_codex = next(provider for provider in response.json()["hermes_providers"] if provider["key"] == "openai-codex")
    assert openai_codex["configured"] is True
    assert openai_codex["active"] is True


def test_chipmunk_settings_patch_updates_hermes_profile_and_xai_env(monkeypatch, tmp_path):
    home = tmp_path / "home"
    profile = home / ".hermes" / "profiles" / "chipmunk"
    profile.mkdir(parents=True)
    (profile / "config.yaml").write_text("model:\nagent:\nterminal:\n", encoding="utf-8")
    (profile / ".env").write_text("TELEGRAM_BOT_TOKEN=1234567890:abcdefghijklmnopqrstuvwxyz\n", encoding="utf-8")

    def fake_run(*args, **kwargs):
        return subprocess.CompletedProcess(args=args[0], returncode=0, stdout="state = running\npid = 77\n", stderr="")

    monkeypatch.setenv("BRAIN_SPA_HOME", str(tmp_path / "runtime"))
    monkeypatch.setenv("HOME", str(home))
    monkeypatch.setenv("BRAIN_SPA_DISABLE_TELEGRAM_POLLING", "1")
    monkeypatch.setattr("apps.api.brainspa_api.chipmunk_hermes.subprocess.run", fake_run)
    client = TestClient(create_app())

    response = client.patch(
        "/api/settings/chipmunk",
        json={
            "xai_api_key": "xai-secret",
            "voice_model": "grok-voice-think-fast-1.0",
            "restart_gateway": False,
            "hermes": {
                "provider": "openai-codex",
                "model": "gpt-5.5",
                "base_url": "https://chatgpt.com/backend-api/codex",
                "reasoning_effort": "high",
                "service_tier": "normal",
                "max_turns": 25,
                "gateway_timeout": 120,
                "telegram_allowed_users": "42",
                "telegram_home_channel": "42",
            },
        },
    )

    assert response.status_code == 200
    config = (profile / "config.yaml").read_text(encoding="utf-8")
    env = (profile / ".env").read_text(encoding="utf-8")
    assert 'default: "gpt-5.5"' in config
    assert "provider: openai-codex" in config
    assert 'base_url: "https://chatgpt.com/backend-api/codex"' in config
    assert "reasoning_effort: high" in config
    assert "service_tier: normal" in config
    assert "max_turns: 25" in config
    assert "gateway_timeout: 120" in config
    assert "TELEGRAM_ALLOWED_USERS=42" in env
    assert "TELEGRAM_HOME_CHANNEL=42" in env
    assert "XAI_API_KEY=xai-secret" in env
    assert response.json()["hermes"]["service_tier"] == "normal"


def test_default_dataset_generation_is_not_seeded(monkeypatch, tmp_path):
    monkeypatch.setenv("BRAIN_SPA_HOME", str(tmp_path))
    client = TestClient(create_app())

    response = client.post("/api/datasets/generate", json={"example_count": 24})

    assert response.status_code == 400
    assert "no default text dataset" in response.json()["detail"].lower()


def test_dataset_and_model_lifecycle_transitions_are_explicit(monkeypatch, tmp_path):
    monkeypatch.setenv("BRAIN_SPA_HOME", str(tmp_path))
    client = TestClient(create_app())

    dataset = client.post("/api/datasets/snake_rollout/state", json={"state": "validated"})
    invalid_model = client.post("/api/models/snake_policy/state", json={"state": "archived"})
    model = client.post("/api/models/snake_policy/state", json={"state": "active"})

    assert dataset.status_code == 200
    assert dataset.json()["state"] == "validated"
    assert invalid_model.status_code == 400
    assert "Invalid model transition" in invalid_model.json()["detail"]
    assert model.status_code == 200
    assert model.json()["state"] == "active"
    assert event_log_path().exists()


def test_training_dry_run_reports_local_policy_shell(monkeypatch, tmp_path):
    monkeypatch.setenv("BRAIN_SPA_HOME", str(tmp_path))
    client = TestClient(create_app())

    response = client.post("/api/training/dry-run", json={})

    assert response.status_code == 200
    payload = response.json()
    assert payload["dataset_key"] == "snake_rollout"
    assert payload["output_dir"].endswith("snake_rl_validation")
    assert "Dry-run only: no model weights were changed." in payload["notes"]


def test_tune_status_lists_snake_policy_and_alias_dry_run(monkeypatch, tmp_path):
    monkeypatch.setenv("BRAIN_SPA_HOME", str(tmp_path))
    client = TestClient(create_app())

    status = client.get("/api/tune/status")
    assert status.status_code == 200
    models = status.json()["models"]
    snake = next(item for item in models if item["slug"] == "snake")
    assert snake["model_key"] == "snake_policy"
    assert snake["display_name"] == "Snake Policy"
    assert snake["policy_state"] == "missing"
    assert snake["dataset_key"] == "snake_rollout"

    slug_status = client.get("/api/tune/snake/status")
    assert slug_status.status_code == 200
    assert slug_status.json()["slug"] == "snake"

    dry_run = client.post("/api/tune/dry-run", json={"model_key": "snake_policy", "dataset_key": "snake_rollout"})
    assert dry_run.status_code == 200
    assert dry_run.json()["dataset_key"] == "snake_rollout"

    preview = client.get("/api/tune/snake/build-preview")
    assert preview.status_code == 200
    assert preview.json()["dataset_display_label"] == "Snake rollout"
    assert preview.json()["slug"] == "snake"


def test_eval_returns_fine_grained_comments(monkeypatch, tmp_path):
    monkeypatch.setenv("BRAIN_SPA_HOME", str(tmp_path))
    client = TestClient(create_app())

    response = client.post(
        "/api/evals/run",
        json={
            "environment_key": "snake_10x10",
            "prompt": "Score a Snake policy decision.",
            "answer": "The snake reads grid state, moves left/right/straight toward the apple, earns reward for apples and survival, and fails on wall collision.",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["passed"] is True
    assert {comment["dimension"] for comment in payload["comments"]} == {
        "world_state",
        "actions",
        "scoring",
        "failure",
    }


def test_generic_eval_scores_harness_shape(monkeypatch, tmp_path):
    monkeypatch.setenv("BRAIN_SPA_HOME", str(tmp_path))
    client = TestClient(create_app())

    response = client.post(
        "/api/evals/run",
        json={
            "environment_key": "custom_environment",
            "answer": "The environment exposes world state, allowed tool actions, scoring metrics, and blocked failure cases.",
        },
    )

    assert response.status_code == 200
    dimensions = {comment["dimension"]: comment["verdict"] for comment in response.json()["comments"]}
    assert dimensions["world_state"] == "good"
    assert dimensions["actions"] == "good"
    assert dimensions["scoring"] == "good"
    assert dimensions["failure"] == "good"


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
        "/api/settings/models/snake_policy/telegram",
        json={"telegram_bot_name": "chipmunk"},
    )
    assert model_patch.status_code == 200
    assert model_patch.json()["telegram_bot_name"] == "chipmunk"


def test_settings_reports_hermes_provider_state(monkeypatch, tmp_path):
    monkeypatch.setenv("BRAIN_SPA_HOME", str(tmp_path / "brain"))
    monkeypatch.setenv("HERMES_HOME", str(tmp_path / "hermes"))
    hermes_home = tmp_path / "hermes"
    hermes_home.mkdir()
    (hermes_home / "config.yaml").write_text(
        "model:\n  default: gpt-5.5\n  provider: openai-codex\n  base_url: https://chatgpt.com/backend-api/codex\n",
        encoding="utf-8",
    )
    (hermes_home / "auth.json").write_text(
        json.dumps(
            {
                "version": 1,
                "providers": {
                    "openai-codex": {
                        "tokens": {"access_token": "access", "refresh_token": "refresh"},
                        "auth_mode": "chatgpt",
                    }
                },
            }
        ),
        encoding="utf-8",
    )
    client = TestClient(create_app())

    response = client.get("/api/settings")

    assert response.status_code == 200
    providers = {item["key"]: item for item in response.json()["hermes_providers"]}
    assert providers["openai-codex"]["configured"] is True
    assert providers["openai-codex"]["active"] is True
    assert providers["openai-codex"]["model"] == "gpt-5.5"
    assert providers["xai"]["configured"] is False


def test_connect_hermes_codex_imports_codex_cli_tokens(monkeypatch, tmp_path):
    monkeypatch.setenv("BRAIN_SPA_HOME", str(tmp_path / "brain"))
    monkeypatch.setenv("HERMES_HOME", str(tmp_path / "hermes"))
    monkeypatch.setenv("CODEX_HOME", str(tmp_path / "codex"))
    codex_home = tmp_path / "codex"
    codex_home.mkdir()
    (codex_home / "auth.json").write_text(
        json.dumps(
            {
                "tokens": {"access_token": "access", "refresh_token": "refresh"},
                "last_refresh": "test-refresh",
            }
        ),
        encoding="utf-8",
    )
    client = TestClient(create_app())

    response = client.post("/api/hermes/providers/openai-codex/connect")

    assert response.status_code == 200
    payload = response.json()
    assert payload["connected"] is True
    assert payload["provider"]["active"] is True
    auth = json.loads((tmp_path / "hermes" / "auth.json").read_text(encoding="utf-8"))
    assert auth["providers"]["openai-codex"]["tokens"]["refresh_token"] == "refresh"
    assert "provider: openai-codex" in (tmp_path / "hermes" / "config.yaml").read_text(encoding="utf-8")


def test_connect_hermes_xai_syncs_brain_spa_key(monkeypatch, tmp_path):
    monkeypatch.setenv("BRAIN_SPA_HOME", str(tmp_path / "brain"))
    monkeypatch.setenv("HERMES_HOME", str(tmp_path / "hermes"))
    from apps.api.brainspa_api.state import set_xai_api_key

    set_xai_api_key("xai-secret")
    client = TestClient(create_app())

    response = client.post("/api/hermes/providers/xai/connect")

    assert response.status_code == 200
    payload = response.json()
    assert payload["connected"] is True
    assert payload["provider"]["active"] is True
    env_text = (tmp_path / "hermes" / ".env").read_text(encoding="utf-8")
    assert "XAI_API_KEY=xai-secret" in env_text
    assert "provider: xai" in (tmp_path / "hermes" / "config.yaml").read_text(encoding="utf-8")


def test_worker_preview_and_chipmunk_routing(monkeypatch, tmp_path):
    monkeypatch.setenv("BRAIN_SPA_HOME", str(tmp_path))
    client = TestClient(create_app())

    worker = client.post(
        "/api/workers/run",
        json={"agent_key": "datasets", "backend": "codex", "task": "audit snake dataset"},
    )
    chipmunk = client.post("/api/chipmunk/chat", json={"message": "generate a dataset"})

    assert worker.status_code == 200
    assert worker.json()["agent_key"] == "datasets"
    assert chipmunk.status_code == 200
    assert chipmunk.json()["routed_to"] == "datasets"


def test_chipmunk_reports_hermes_model_blocker_without_traceback(monkeypatch, tmp_path):
    monkeypatch.setenv("BRAIN_SPA_HOME", str(tmp_path))
    from apps.api.brainspa_api.workflows import chipmunk_reply

    class FailedHermes:
        returncode = 1
        stdout = ""
        stderr = "Traceback (most recent call last):\nNo provider configured"

    monkeypatch.setattr("apps.api.brainspa_api.workflows.shutil.which", lambda key: "/usr/local/bin/hermes" if key == "hermes" else None)
    monkeypatch.setattr("apps.api.brainspa_api.workflows.subprocess.run", lambda *args, **kwargs: FailedHermes())

    result = chipmunk_reply("hello chipmunk")

    assert result.routed_to == "chipmunk"
    assert "Hermes is installed" in result.reply
    assert "Configure Hermes auth" in result.suggested_actions
    assert "Traceback" not in result.reply


def test_harness_chat_blocks_chat_runtime_for_public_shell(monkeypatch, tmp_path):
    monkeypatch.setenv("BRAIN_SPA_HOME", str(tmp_path))
    from apps.api.brainspa_api.config import model_feedback_path

    client = TestClient(create_app())

    first = client.post(
        "/api/harness/chat/send",
        json={
            "model_key": "snake_policy",
            "scenario_key": "autonomous-train",
            "text": "Can you chat like a model?",
        },
    )
    assert first.status_code == 200
    first_payload = first.json()
    assert first_payload["kind"] == "assistant_reply"
    assert first_payload["generation_state"] == "blocked"
    assert "interactive environment pages" in first_payload["message"]["content"]

    thread = client.get("/api/harness/chat/snake_policy/autonomous-train")
    assert thread.status_code == 200
    messages = thread.json()["messages"]
    assert [message["role"] for message in messages] == ["user", "system"]

    feedback = client.post(
        "/api/harness/chat/send",
        json={
            "model_key": "snake_policy",
            "scenario_key": "autonomous-train",
            "text": "This should be environment feedback, not chat feedback.",
            "reply_to_message_id": first_payload["message"]["id"],
        },
    )
    assert feedback.status_code == 200
    assert feedback.json()["feedback_recorded"] is False
    assert not model_feedback_path().exists()
