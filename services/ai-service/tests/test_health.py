def test_health_returns_ok(client) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["checks"] == {}


def test_ready_returns_ok_with_noop_provider(client) -> None:
    response = client.get("/ready")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["checks"]["provider"] is True


def test_v1_status(client) -> None:
    response = client.get("/v1/status")
    assert response.status_code == 200
    body = response.json()
    assert body["service"] == "folio-ai-service"
    assert body["arabert_enabled"] is False
