from __future__ import annotations


def test_evidence_sources_start_empty(client):
    response = client.get("/api/evidence/sources")

    assert response.status_code == 200
    assert response.json() == []


def test_evidence_manifest_is_valid_without_sources(client):
    response = client.get("/api/evidence/manifest")

    assert response.status_code == 200
    body = response.json()
    assert body["approved_count"] == 0
    assert body["sources"] == {}
    assert body["models"] == {}


def test_evidence_unknown_source_returns_404(client):
    response = client.get("/api/evidence/sources/not_a_real_source/claims")

    assert response.status_code == 404
