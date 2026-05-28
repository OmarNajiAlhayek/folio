from openai import AsyncOpenAI, BadRequestError

from app.config import Settings


def _is_local_compat_base_url(base_url: str | None) -> bool:
    """LM Studio and most local gateways reject OpenAI ``json_object`` response_format."""
    if not base_url:
        return False
    lowered = base_url.lower()
    return (
        "localhost" in lowered
        or "127.0.0.1" in lowered
        or "[::1]" in lowered
        or "0.0.0.0" in lowered
    )


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

    def _uses_local_gateway(self) -> bool:
        return _is_local_compat_base_url(str(self._client.base_url))

    async def _chat_completion(self, system: str, user: str, *, json_mode: bool) -> str:
        kwargs: dict = {
            "model": self._model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": 0.1,
        }
        if json_mode:
            kwargs["response_format"] = {"type": "json_object"}
        response = await self._client.chat.completions.create(**kwargs)
        if not response.choices:
            raise ValueError("OpenAI response has no choices")
        content = response.choices[0].message.content
        if not content or not content.strip():
            raise ValueError("OpenAI response has empty content")
        return content.strip()

    async def chat_json(self, system: str, user: str) -> str:
        """Chat completion; JSON enforced via response_format when supported."""
        if self._uses_local_gateway():
            return await self._chat_completion(system, user, json_mode=False)
        try:
            return await self._chat_completion(system, user, json_mode=True)
        except BadRequestError:
            return await self._chat_completion(system, user, json_mode=False)
