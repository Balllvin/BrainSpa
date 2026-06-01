from __future__ import annotations

import json

from fastapi.testclient import TestClient

from apps.api.brainspa_api.config import evidence_manifest_path, model_feedback_path, source_claims_path
from apps.api.brainspa_api.datasets_workflows import train_jsonl_path
from apps.api.brainspa_api.main import create_app


def _seed_approved_evidence(tmp_path, claim_count: int = 2) -> None:
    claims_dir = tmp_path / "artifacts" / "evidence"
    claims_dir.mkdir(parents=True, exist_ok=True)
    claims = []
    for index in range(claim_count):
        claim = {
            "id": f"claim-test-{index + 1}",
            "source_key": "composer_training_interview",
            "text": f"Faith answer {index + 1} must be blunt and grounded, not generic assistant tone.",
            "status": "approved",
            "ingested_at": "2026-05-29T00:00:00+00:00",
        }
        claims.append(claim)
    source_claims_path().parent.mkdir(parents=True, exist_ok=True)
    source_claims_path().write_text(
        "\n".join(json.dumps(item) for item in claims) + "\n",
        encoding="utf-8",
    )
    manifest = {
        "version": 1,
        "updated_at": "2026-05-29T00:00:00+00:00",
        "behavior_focus": "Blunt starter persona",
        "artifact_dir": str(claims_dir),
        "sources": {},
        "approved_claim_ids": [item["id"] for item in claims],
        "approved_count": len(claims),
    }
    evidence_manifest_path().write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


def test_generate_blocked_without_approved_evidence(monkeypatch, tmp_path):
    monkeypatch.setenv("BRAIN_SPA_HOME", str(tmp_path))
    client = TestClient(create_app())

    response = client.post(
        "/api/datasets/starter_seed/generate",
        json={"example_count": 12, "ground_in_evidence": True},
    )

    assert response.status_code == 400
    assert "approved evidence" in response.json()["detail"].lower()


def test_grounded_rows_include_claim_ids(monkeypatch, tmp_path):
    monkeypatch.setenv("BRAIN_SPA_HOME", str(tmp_path))
    _seed_approved_evidence(tmp_path)
    client = TestClient(create_app())

    response = client.post(
        "/api/datasets/starter_seed/generate",
        json={
            "example_count": 8,
            "ground_in_evidence": True,
            "scenarios": ["counsel", "review"],
            "mix_even": True,
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["grounded_in_evidence"] is True
    assert payload["scenario_mix"]

    rows = [json.loads(line) for line in train_jsonl_path("starter_seed").read_text().splitlines() if line.strip()]
    assert all(row["metadata"].get("evidence_claim_ids") for row in rows)
    assert all(row["metadata"]["source"] == "approved_evidence" for row in rows)


def test_template_mode_warns_without_claim_ids(monkeypatch, tmp_path):
    monkeypatch.setenv("BRAIN_SPA_HOME", str(tmp_path))
    _seed_approved_evidence(tmp_path)
    client = TestClient(create_app())

    response = client.post(
        "/api/datasets/starter_seed/generate",
        json={"example_count": 8, "ground_in_evidence": False},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["grounded_in_evidence"] is False
    assert any("Template fallback" in warning for warning in payload["warnings"])

    rows = [json.loads(line) for line in train_jsonl_path("starter_seed").read_text().splitlines() if line.strip()]
    assert all(row["metadata"].get("evidence_claim_ids") == [] for row in rows)
    assert all(row["metadata"]["source"] == "template" for row in rows)


def test_preview_only_does_not_write_files(monkeypatch, tmp_path):
    monkeypatch.setenv("BRAIN_SPA_HOME", str(tmp_path))
    _seed_approved_evidence(tmp_path)
    client = TestClient(create_app())

    response = client.post(
        "/api/datasets/starter_seed/generate",
        json={"example_count": 12, "preview_only": True, "ground_in_evidence": True},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["preview_only"] is True
    assert len(payload["preview_samples"]) == 2
    assert not train_jsonl_path("starter_seed").exists()


def test_generate_and_rows_crud(monkeypatch, tmp_path):
    monkeypatch.setenv("BRAIN_SPA_HOME", str(tmp_path))
    _seed_approved_evidence(tmp_path)
    client = TestClient(create_app())

    generated = client.post(
        "/api/datasets/starter_seed/generate",
        json={"example_count": 12, "ground_in_evidence": True},
    )
    assert generated.status_code == 200
    payload = generated.json()
    assert payload["dataset"]["row_count"] == 12
    assert payload["examples_path"].endswith("dataset_sft_train.jsonl")

    rows = client.get("/api/datasets/starter_seed/rows?limit=5")
    assert rows.status_code == 200
    page = rows.json()
    assert page["total"] == 12
    row_id = page["rows"][0]["id"]

    patched = client.patch(
        f"/api/datasets/starter_seed/rows/{row_id}",
        json={"assistant_answer": "Name the issue plainly and take the next concrete step."},
    )
    assert patched.status_code == 200

    deleted = client.delete(f"/api/datasets/starter_seed/rows/{row_id}")
    assert deleted.status_code == 200
    after = client.get("/api/datasets/starter_seed/rows")
    assert after.json()["total"] == 11


def test_create_manual_row(monkeypatch, tmp_path):
    monkeypatch.setenv("BRAIN_SPA_HOME", str(tmp_path))
    client = TestClient(create_app())

    created = client.post(
        "/api/datasets/starter_seed/rows",
        json={
            "scenario_key": "review",
            "user_prompt": "This answer feels too vague.",
            "assistant_answer": "Name the vague part, add evidence, and give one concrete next action.",
            "failure_labels": ["generic_slop"],
        },
    )
    assert created.status_code == 200
    assert created.json()["scenario_key"] == "review"

    listed = client.get("/api/datasets/starter_seed/rows")
    assert listed.json()["total"] == 1


def test_review_heavy_pack_skews_mix(monkeypatch, tmp_path):
    monkeypatch.setenv("BRAIN_SPA_HOME", str(tmp_path))
    _seed_approved_evidence(tmp_path)
    client = TestClient(create_app())

    response = client.post(
        "/api/datasets/starter_seed/generate",
        json={"pack": "review-heavy"},
    )
    assert response.status_code == 200
    mix = response.json()["scenario_mix"]
    assert mix.get("review", 0) >= 4


def test_import_test_feedback_is_idempotent(monkeypatch, tmp_path):
    monkeypatch.setenv("BRAIN_SPA_HOME", str(tmp_path))
    _seed_approved_evidence(tmp_path)
    client = TestClient(create_app())
    client.post("/api/datasets/starter_seed/generate", json={"example_count": 8})

    feedback_file = model_feedback_path()
    feedback_file.parent.mkdir(parents=True, exist_ok=True)
    record = {
        "source": "harness_chat_reply_feedback",
        "model_key": "starter_model",
        "scenario_key": "counsel",
        "prompt": "What do you think about vague answers?",
        "answer": "Stay positive and trust the process.",
        "feedback": "Answer directly with a specific correction and evidence.",
        "harness_message_id": 42,
        "feedback_message_id": 43,
    }
    feedback_file.write_text(json.dumps(record) + "\n", encoding="utf-8")

    first = client.post("/api/datasets/starter_seed/import-test-feedback")
    assert first.status_code == 200
    assert first.json()["imported_count"] == 1

    second = client.post("/api/datasets/starter_seed/import-test-feedback")
    assert second.json()["imported_count"] == 0
    assert second.json()["skipped_duplicates"] >= 1
