import os

import pytest
from fastapi.testclient import TestClient

import app.grpc  # noqa: F401 — adds generated proto packages to sys.path

# Default test env before any app imports.
os.environ.setdefault("APP_ENV", "development")
os.environ.setdefault("AI_PROVIDER", "noop")
os.environ.setdefault("ARABERT_ENABLED", "false")
os.environ.setdefault("GRPC_PORT", "0")


@pytest.fixture
def client() -> TestClient:
    from app.config import get_settings
    from app.main import create_app

    get_settings.cache_clear()
    app = create_app()
    with TestClient(app) as test_client:
        yield test_client
