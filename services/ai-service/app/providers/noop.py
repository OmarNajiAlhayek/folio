class NoopAiProvider:
    """Default dev provider: no external API calls."""

    @property
    def name(self) -> str:
        return "noop"

    async def ping(self) -> bool:
        return True
