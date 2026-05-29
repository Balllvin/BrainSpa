from __future__ import annotations

import json

from fastapi.testclient import TestClient

from apps.api.brainspa_api.config import evidence_manifest_path, source_claims_path
from apps.api.brainspa_api.main import create_app


def test_evidence_ingest_approve_and_manifest(monkeypatch, tmp_path):
    monkeypatch.setenv("BRAIN_SPA_HOME", str(tmp_path))
    client = TestClient(create_app())

    sources = client.get("/api/evidence/sources")
    assert sources.status_code == 200
    payload = sources.json()
    believer = next(item for item in payload if item["key"] == "believer_voice_refs")
    assert "Believer" in believer["feeds_model_labels"]

    ingest = client.post(
        "/api/evidence/sources/believer_voice_refs/ingest",
        json={"query": "Blunt faith voice, no generic hedging"},
    )
    assert ingest.status_code == 200
    body = ingest.json()
    assert body["claims_added"] >= 1
    assert body["claim_ids"]

    claims = client.get("/api/evidence/claims", params={"model": "believer", "status": "pending"})
    assert claims.status_code == 200
    claim_list = claims.json()
    assert len(claim_list) >= 1
    claim_id = claim_list[0]["id"]

    approved = client.patch(
        f"/api/evidence/claims/{claim_id}",
        json={"status": "approved", "note": "Good signal"},
    )
    assert approved.status_code == 200
    assert approved.json()["status"] == "approved"

    manifest = client.get("/api/evidence/manifest")
    assert manifest.status_code == 200
    manifest_body = manifest.json()
    assert manifest_body["approved_count"] >= 1
    assert manifest_body["models"]["believer"]["approved_count"] >= 1

    approved_claims = client.get("/api/evidence/approved-claims", params={"model": "believer"})
    assert approved_claims.status_code == 200
    approved_body = approved_claims.json()
    assert approved_body["ready_for_datasets"] is True


def test_evidence_manual_claim_bulk_approve_and_delete(monkeypatch, tmp_path):
    monkeypatch.setenv("BRAIN_SPA_HOME", str(tmp_path))
    client = TestClient(create_app())

    created = client.post(
        "/api/evidence/claims",
        json={
            "text": "Speak with blunt pastoral conviction, not corporate tone.",
            "citation": "Pastor interview clip, 12:04",
            "source_key": "believer_voice_refs",
        },
    )
    assert created.status_code == 200
    claim_id = created.json()["id"]

    bulk = client.post("/api/evidence/claims/bulk-approve", params={"model": "believer"})
    assert bulk.status_code == 200
    assert bulk.json()["approved_count"] >= 1

    pending = client.post(
        "/api/evidence/claims",
        json={
            "text": "Temporary pending claim to delete.",
            "citation": "Draft note",
            "source_key": "believer_voice_refs",
        },
    )
    pending_id = pending.json()["id"]
    deleted = client.delete(f"/api/evidence/claims/{pending_id}")
    assert deleted.status_code == 200

    edited = client.patch(
        f"/api/evidence/claims/{claim_id}",
        json={"text": "Updated blunt conviction claim."},
    )
    assert edited.status_code == 400

    summary = client.get("/api/evidence/models/believer")
    assert summary.status_code == 200
    assert summary.json()["ready_for_datasets"] is True


def test_evidence_unknown_source_returns_404(monkeypatch, tmp_path):
    monkeypatch.setenv("BRAIN_SPA_HOME", str(tmp_path))
    client = TestClient(create_app())

    response = client.get("/api/evidence/sources/not_a_real_source/claims")

    assert response.status_code == 404
