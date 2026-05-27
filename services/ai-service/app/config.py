from enum import StrEnum
from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

PLACEHOLDER_OPENAI_KEYS = frozenset(
    {
        "",
        "changeme",
        "sk-changeme",
        "your-api-key",
        "your_api_key",
        "replace-me",
    }
)


class AiProviderKind(StrEnum):
    NOOP = "noop"
    OPENAI = "openai"


class RuntimeConfigError(ValueError):
    """Raised when environment configuration is invalid for the current APP_ENV."""


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    app_env: str = Field(default="development", validation_alias="APP_ENV")
    port: int = Field(default=5245, validation_alias="PORT")
    grpc_port: int = Field(default=5246, validation_alias="GRPC_PORT")
    log_level: str = Field(default="info", validation_alias="LOG_LEVEL")
    ai_service_token: str = Field(default="", validation_alias="AI_SERVICE_TOKEN")
    ai_provider: AiProviderKind = Field(
        default=AiProviderKind.NOOP,
        validation_alias="AI_PROVIDER",
    )
    openai_api_key: str = Field(default="", validation_alias="OPENAI_API_KEY")
    openai_base_url: str | None = Field(default=None, validation_alias="OPENAI_BASE_URL")
    openai_model: str = Field(default="gpt-4o-mini", validation_alias="OPENAI_MODEL")
    runtime_config_strict: bool = Field(
        default=False,
        validation_alias="RUNTIME_CONFIG_STRICT",
    )

    arabert_enabled: bool = Field(default=False, validation_alias="ARABERT_ENABLED")
    arabert_model_path: str = Field(default="", validation_alias="ARABERT_MODEL_PATH")
    arabert_preprocessor_model: str = Field(
        default="aubmindlab/bert-base-arabertv02",
        validation_alias="ARABERT_PREPROCESSOR_MODEL",
    )
    arabert_default_threshold: float = Field(
        default=0.0,
        validation_alias="ARABERT_DEFAULT_THRESHOLD",
    )
    arabert_idle_timeout_seconds: int = Field(
        default=300,
        validation_alias="ARABERT_IDLE_TIMEOUT_SECONDS",
    )
    arabert_warmup_on_startup: bool = Field(
        default=True,
        validation_alias="ARABERT_WARMUP_ON_STARTUP",
    )

    similarity_enabled: bool = Field(default=False, validation_alias="SIMILARITY_ENABLED")
    similarity_chroma_path: str = Field(
        default="./data/chroma_similarity",
        validation_alias="SIMILARITY_CHROMA_PATH",
    )
    similarity_collection_name: str = Field(
        default="folio_published_articles",
        validation_alias="SIMILARITY_COLLECTION_NAME",
    )
    similarity_model_name: str = Field(
        default="sentence-transformers/paraphrase-multilingual-mpnet-base-v2",
        validation_alias="SIMILARITY_MODEL_NAME",
    )
    similarity_device: str = Field(default="cpu", validation_alias="SIMILARITY_DEVICE")
    similarity_batch_size: int = Field(default=32, validation_alias="SIMILARITY_BATCH_SIZE")
    similarity_default_limit: int = Field(default=5, validation_alias="SIMILARITY_DEFAULT_LIMIT")
    similarity_default_threshold: float = Field(
        default=0.35,
        validation_alias="SIMILARITY_DEFAULT_THRESHOLD",
    )
    similarity_same_category_only: bool = Field(
        default=True,
        validation_alias="SIMILARITY_SAME_CATEGORY_ONLY",
    )

    @field_validator("similarity_enabled", mode="before")
    @classmethod
    def parse_similarity_enabled(cls, value: object) -> bool:
        if isinstance(value, bool):
            return value
        if value is None:
            return False
        return str(value).strip().lower() in {"1", "true", "yes", "on"}

    @field_validator("similarity_same_category_only", mode="before")
    @classmethod
    def parse_similarity_same_category_only(cls, value: object) -> bool:
        if isinstance(value, bool):
            return value
        if value is None:
            return True
        return str(value).strip().lower() in {"1", "true", "yes", "on"}

    @field_validator("arabert_enabled", mode="before")
    @classmethod
    def parse_arabert_enabled(cls, value: object) -> bool:
        if isinstance(value, bool):
            return value
        if value is None:
            return False
        return str(value).strip().lower() in {"1", "true", "yes", "on"}

    @field_validator("arabert_warmup_on_startup", mode="before")
    @classmethod
    def parse_arabert_warmup_on_startup(cls, value: object) -> bool:
        if isinstance(value, bool):
            return value
        if value is None:
            return True
        return str(value).strip().lower() in {"1", "true", "yes", "on"}

    @field_validator("app_env", mode="before")
    @classmethod
    def normalize_app_env(cls, value: object) -> str:
        if value is None or (isinstance(value, str) and not value.strip()):
            node_env = __import__("os").environ.get("NODE_ENV", "development")
            return str(node_env).strip().lower()
        return str(value).strip().lower()

    @field_validator("ai_provider", mode="before")
    @classmethod
    def normalize_ai_provider(cls, value: object) -> AiProviderKind:
        if isinstance(value, AiProviderKind):
            return value
        raw = str(value).strip().lower() if value is not None else "noop"
        try:
            return AiProviderKind(raw)
        except ValueError as err:
            allowed = ", ".join(p.value for p in AiProviderKind)
            raise ValueError(f"AI_PROVIDER must be one of: {allowed}") from err

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    def validate_runtime(self) -> None:
        """Fail fast when production or strict mode requires real provider credentials."""
        enforce = self.is_production or self.runtime_config_strict
        if not enforce:
            return

        if self.ai_provider == AiProviderKind.NOOP:
            raise RuntimeConfigError(
                "AI_PROVIDER=noop is not allowed when APP_ENV=production "
                "(or RUNTIME_CONFIG_STRICT=true). "
                "Set AI_PROVIDER=openai and configure OPENAI_API_KEY.",
            )

        if self.ai_provider == AiProviderKind.OPENAI:
            key = self.openai_api_key.strip()
            if key.lower() in PLACEHOLDER_OPENAI_KEYS:
                raise RuntimeConfigError(
                    "OPENAI_API_KEY must be set to a real secret when AI_PROVIDER=openai "
                    "in production (or strict mode).",
                )

        if not self.ai_service_token.strip():
            raise RuntimeConfigError(
                "AI_SERVICE_TOKEN must be set in production (or strict mode). "
                "Nest and other internal callers must authenticate to gRPC classify RPCs.",
            )


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.validate_runtime()
    return settings
