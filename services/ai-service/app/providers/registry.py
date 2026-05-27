from app.config import AiProviderKind, Settings
from app.providers.base import AiProvider
from app.providers.noop import NoopAiProvider
from app.providers.openai_compat import OpenAiCompatProvider


def create_provider(settings: Settings) -> AiProvider:
    if settings.ai_provider == AiProviderKind.NOOP:
        return NoopAiProvider()
    if settings.ai_provider == AiProviderKind.OPENAI:
        return OpenAiCompatProvider(settings)
    raise ValueError(f"Unsupported AI_PROVIDER: {settings.ai_provider}")
