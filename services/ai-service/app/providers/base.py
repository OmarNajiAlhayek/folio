from typing import Protocol


class AiProvider(Protocol):
    """Pluggable LLM backend; product routes will call higher-level methods later."""

    @property
    def name(self) -> str:
        """Provider identifier (e.g. noop, openai)."""

    async def ping(self) -> bool:
        """Return True when the provider is configured and reachable enough for /ready."""
