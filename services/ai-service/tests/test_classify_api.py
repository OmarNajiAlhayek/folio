from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def disabled_classifier_client(client: TestClient) -> TestClient:
    service = client.app.state.classifier_service
    service._settings.arabert_enabled = False
    return client


@pytest.fixture
def mock_classifier_client(client: TestClient) -> TestClient:
    service = client.app.state.classifier_service
    service._settings.arabert_enabled = True
    service._get_classifier = MagicMock()  # type: ignore[method-assign]
    service.classify_abstract = AsyncMock(
        return_value={
            "top_label": "العلوم الطبية",
            "top_confidence": 88.5,
            "probabilities": {"العلوم الطبية": 88.5, "غير محدد": 11.5},
        },
    )
    service.classify_article = AsyncMock(
        return_value={
            "top_label": "العلوم الطبية",
            "top_confidence": 90.0,
            "probabilities": {"العلوم الطبية": 90.0},
        },
    )
    service.labels = MagicMock(return_value=["العلوم الطبية", "غير محدد"])
    service.status = MagicMock(
        return_value={
            "enabled": True,
            "model_path": "/weights",
            "device": "cpu",
            "labels_count": 2,
            "weights_loaded": False,
            "model_configured": True,
        },
    )
    return client


def test_classify_status_when_disabled(disabled_classifier_client: TestClient) -> None:
    response = disabled_classifier_client.get("/v1/classify/status")
    assert response.status_code == 200
    body = response.json()
    assert body["enabled"] is False


def test_classify_abstract_503_when_disabled(disabled_classifier_client: TestClient) -> None:
    response = disabled_classifier_client.post(
        "/v1/classify/abstract",
        json={"abstract": "نص تجريبي"},
    )
    assert response.status_code == 503


def test_classify_abstract_mocked(mock_classifier_client: TestClient) -> None:
    response = mock_classifier_client.post(
        "/v1/classify/abstract",
        json={"abstract": "دراسة في الصحة العامة"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["top_label"] == "العلوم الطبية"
    assert body["top_confidence"] == 88.5


def test_classify_labels_mocked(mock_classifier_client: TestClient) -> None:
    response = mock_classifier_client.get("/v1/classify/labels")
    assert response.status_code == 200
    assert response.json()["labels"] == ["العلوم الطبية", "غير محدد"]


def test_classify_requires_token_when_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.config import get_settings
    from app.main import create_app

    monkeypatch.setenv("AI_SERVICE_TOKEN", "test-token")
    get_settings.cache_clear()
    app = create_app()
    with TestClient(app) as client:
        response = client.post(
            "/v1/classify/abstract",
            json={"abstract": "نص"},
        )
        assert response.status_code == 401

        response = client.post(
            "/v1/classify/abstract",
            json={"abstract": "نص"},
            headers={"X-Folio-Service-Token": "test-token"},
        )
        assert response.status_code in {200, 503}
