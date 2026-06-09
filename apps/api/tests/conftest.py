from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from apps.api.brainspa_api.main import create_app


@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setenv("BRAIN_SPA_HOME", str(tmp_path))
    monkeypatch.setenv("BRAIN_SPA_DISABLE_TELEGRAM_POLLING", "1")
    return TestClient(create_app())