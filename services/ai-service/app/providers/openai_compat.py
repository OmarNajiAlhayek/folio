from openai import AsyncOpenAI

from app.config import Settings


class OpenAiCompatProvider:
    """OpenAI-compatible API client; scaffold only validates configuration."""

    def __init__(self, settings: Settings) -> None:
        kwargs: dict[str, str] = {"api_key": settings.openai_api_key.strip()}
        if settings.openai_base_url:
            kwargs["base_url"] = settings.openai_base_url.strip()
        self._client = AsyncOpenAI(**kwargs)
        self._model = settings.openai_model

    @property
    def name(self) -> str:
        return "openai"

    @property
    def model(self) -> str:
        return self._model

    async def ping(self) -> bool:
        # Scaffold: avoid billed API calls; key + client wiring is enough for /ready.
        return bool(self._client.api_key)
