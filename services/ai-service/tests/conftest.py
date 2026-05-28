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
def reviewer_matching_grpc_service():
    """Disabled reviewer matching stub for gRPC server tests."""
    from unittest.mock import AsyncMock

    from app.config import Settings
    from app.services.reviewer_matching_grpc_service import ReviewerMatchingGrpcService

    service = ReviewerMatchingGrpcService(Settings(reviewer_matching_enabled=False))
    service.suggest_reviewers = AsyncMock(return_value=[])  # type: ignore[method-assign]
    return service


@pytest.fixture(autouse=True)
def reset_vector_engine() -> None:
    """Isolate Chroma / encoder singleton between tests."""
    from app.ml.vector.ai_engine import AIEngine

    AIEngine.reset_instance()
    yield
    AIEngine.reset_instance()


@pytest.fixture
def client() -> TestClient:
    from app.config import get_settings
    from app.main import create_app

    get_settings.cache_clear()
    app = create_app()
    with TestClient(app) as test_client:
        yield test_client
