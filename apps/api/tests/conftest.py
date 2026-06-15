from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from apps.api.brainspa_api.main import create_app


@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setenv("BRAIN_SPA_HOME", str(tmp_path))
    monkeypatch.setenv("BRAIN_SPA_DISABLE_TELEGRAM_POLLING", "1")
    yield TestClient(create_app())
    # Drain any background training jobs before the per-test home is torn down,
    # so a daemon thread can't write into the next test's runtime home.
    try:
        from packages.brainspa_ml import jobs

        jobs.wait_for_all(timeout=20.0)
    except Exception:  # noqa: BLE001
        pass