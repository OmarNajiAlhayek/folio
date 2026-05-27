import pytest
from fastapi.testclient import TestClient


def test_similarity_status_when_disabled(client: TestClient) -> None:
    service = client.app.state.similarity_service
    service._settings.similarity_enabled = False
    res = client.get("/v1/similar/status")
    assert res.status_code == 200
    assert res.json()["enabled"] is False


def test_find_similar_requires_auth_when_token_set(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AI_SERVICE_TOKEN", "test-token")
    from app.config import get_settings

    get_settings.cache_clear()
    from app.main import create_app

    app = create_app()
    with TestClient(app) as authed_client:
        res = authed_client.post(
            "/v1/similar/find",
            json={"article_id": "missing"},
        )
        assert res.status_code == 401
    get_settings.cache_clear()


@pytest.mark.similarity
def test_upsert_and_find_similar_roundtrip(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("SIMILARITY_ENABLED", "true")
    from app.config import get_settings

    get_settings.cache_clear()
    from app.main import create_app

    app = create_app()
    app.state.similarity_service._settings.similarity_enabled = True

    with TestClient(app) as ml_client:
        for i, abstract in enumerate(
            [
                "الذكاء الاصطناعي يغير مستقبل البرمجة.",
                "تعلم لغة بايثون للمبتدئين.",
                "فوائد الرياضة الصباحية على الصحة.",
            ],
            start=1,
        ):
            res = ml_client.post(
                "/v1/similar/articles",
                json={
                    "article_id": f"art-{i}",
                    "abstract": abstract,
                    "keywords": "تقنية",
                    "category": "technology" if i < 3 else "health",
                },
            )
            assert res.status_code == 200, res.text

        res = ml_client.post(
            "/v1/similar/find",
            json={
                "article_id": "art-1",
                "limit": 2,
                "similarity_threshold": 0.0,
                "same_category_only": True,
            },
        )
        assert res.status_code == 200, res.text
        items = res.json()["items"]
        assert len(items) >= 1
        assert all(item["article_id"] != "art-1" for item in items)
    get_settings.cache_clear()
