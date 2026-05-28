from __future__ import annotations

import json

from fastapi.testclient import TestClient

from apps.api.brainspa_api.config import event_log_path, telegram_config_path
from apps.api.brainspa_api.main import create_app


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
    assert "chipmunk" in {agent["key"] for agent in payload["agents"]}
    assert "chess" in {environment["key"] for environment in payload["environments"]}
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
    assert accepted.json()["routed_to"] == "dataset_builder"


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


def test_believer_dataset_generation_writes_handoff(monkeypatch, tmp_path):
    monkeypatch.setenv("BRAIN_SPA_HOME", str(tmp_path))
    client = TestClient(create_app())

    response = client.post("/api/datasets/generate", json={"example_count": 100})

    assert response.status_code == 200
    payload = response.json()
    assert payload["dataset"]["key"] == "believer_seed"
    assert payload["dataset"]["row_count"] == 100
    assert payload["warnings"] == []
    assert payload["manifest_path"].endswith("sft_handoff.json")
    assert payload["preference_pairs_path"].endswith("preference_pairs.jsonl")
    assert "Source-copy risk check passed" in payload["quality"]


def test_dataset_and_model_lifecycle_transitions_are_explicit(monkeypatch, tmp_path):
    monkeypatch.setenv("BRAIN_SPA_HOME", str(tmp_path))
    client = TestClient(create_app())
    client.post("/api/datasets/generate", json={"example_count": 8})

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
    monkeypatch.setenv("BRAIN_SPA_HOME", str(tmp_path))
    client = TestClient(create_app())
    client.post("/api/datasets/generate", json={"example_count": 8})

    response = client.post("/api/training/dry-run", json={})

    assert response.status_code == 200
    payload = response.json()
    assert payload["model"] == "HuggingFaceTB/SmolLM2-360M-Instruct"
    assert payload["backend"] in {"mlx_lm", "unsloth_trl", "transformers_trl"}
    assert len(payload["recipes"]) == 5
    assert "Dry-run only: no model weights were changed." in payload["notes"]


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
    }


def test_chess_eval_validates_fen_and_reports_vision_stage(monkeypatch, tmp_path):
    monkeypatch.setenv("BRAIN_SPA_HOME", str(tmp_path))
    client = TestClient(create_app())

    response = client.post(
        "/api/evals/run",
        json={
            "environment_key": "chess",
            "answer": "White can develop a knight and explain how the move affects the center.",
            "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        },
    )

    assert response.status_code == 200
    dimensions = {comment["dimension"]: comment["verdict"] for comment in response.json()["comments"]}
    assert dimensions["board_state"] == "good"
    assert dimensions["vision_path"] == "mixed"


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
        json={"agent_key": "dataset_builder", "backend": "codex", "task": "audit believer dataset"},
    )
    chipmunk = client.post("/api/chipmunk/chat", json={"message": "generate a dataset"})

    assert worker.status_code == 200
    assert worker.json()["agent_key"] == "dataset_builder"
    assert chipmunk.status_code == 200
    assert chipmunk.json()["routed_to"] == "dataset_builder"
