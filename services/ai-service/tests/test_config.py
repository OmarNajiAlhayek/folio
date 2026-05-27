import pytest

from app.config import AiProviderKind, RuntimeConfigError, Settings, get_settings


def test_noop_allowed_in_development(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("AI_PROVIDER", "noop")
    get_settings.cache_clear()
    settings = get_settings()
    assert settings.ai_provider == AiProviderKind.NOOP


def test_production_rejects_noop(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("AI_PROVIDER", "noop")
    get_settings.cache_clear()
    settings = Settings()
    with pytest.raises(RuntimeConfigError, match="noop"):
        settings.validate_runtime()


def test_strict_openai_requires_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("RUNTIME_CONFIG_STRICT", "true")
    monkeypatch.setenv("AI_PROVIDER", "openai")
    monkeypatch.setenv("OPENAI_API_KEY", "")
    monkeypatch.setenv("AI_SERVICE_TOKEN", "internal-token")
    get_settings.cache_clear()
    settings = Settings()
    with pytest.raises(RuntimeConfigError, match="OPENAI_API_KEY"):
        settings.validate_runtime()


def test_openai_with_valid_key_passes_strict(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("RUNTIME_CONFIG_STRICT", "true")
    monkeypatch.setenv("AI_PROVIDER", "openai")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-key-not-a-placeholder")
    monkeypatch.setenv("AI_SERVICE_TOKEN", "internal-service-token")
    get_settings.cache_clear()
    settings = get_settings()
    assert settings.ai_provider == AiProviderKind.OPENAI


def test_production_requires_ai_service_token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("AI_PROVIDER", "openai")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-key-not-a-placeholder")
    monkeypatch.setenv("AI_SERVICE_TOKEN", "")
    get_settings.cache_clear()
    settings = Settings()
    with pytest.raises(RuntimeConfigError, match="AI_SERVICE_TOKEN"):
        settings.validate_runtime()
