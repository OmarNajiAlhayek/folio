from __future__ import annotations

from unittest.mock import AsyncMock

import grpc
import pytest
from folio.ai.v1 import keywords_pb2, keywords_pb2_grpc

from app.config import Settings
from app.grpc.server import start_grpc_server, stop_grpc_server
from app.services.keyword_suggestion_service import KeywordSuggestionService


@pytest.fixture
def mock_keyword_service() -> KeywordSuggestionService:
    settings = Settings(keywords_suggestion_enabled=True, ai_provider="openai")
    service = KeywordSuggestionService(settings)
    service.suggest = AsyncMock(  # type: ignore[method-assign]
        return_value={
            "keywords_en": ["Machine Learning", "Science"],
            "keywords_ar": [],
        },
    )
    service.status = lambda: {"enabled": True}  # type: ignore[method-assign, assignment]
    return service


@pytest.fixture
async def grpc_channel(
    mock_keyword_service: KeywordSuggestionService,
    reviewer_matching_grpc_service,
):
    from app.services.classifier_service import ClassifierService
    from app.services.similarity_service import SimilarityService

    classifier = ClassifierService(Settings(arabert_enabled=False))
    similarity = SimilarityService(Settings(similarity_enabled=False))
    settings = Settings(grpc_port=0, ai_service_token="")
    server, port = await start_grpc_server(
        classifier,
        mock_keyword_service,
        similarity,
        reviewer_matching_grpc_service,
        settings,
    )
    channel = grpc.aio.insecure_channel(f"localhost:{port}")
    try:
        yield channel
    finally:
        await channel.close()
        await stop_grpc_server(server)


@pytest.mark.asyncio
async def test_suggest_keywords_success(grpc_channel: grpc.aio.Channel) -> None:
    stub = keywords_pb2_grpc.KeywordServiceStub(grpc_channel)
    response = await stub.SuggestKeywords(
        keywords_pb2.SuggestKeywordsRequest(
            title="Machine learning",
            abstract="We study neural networks.",
        ),
    )
    assert list(response.keywords_en) == ["Machine Learning", "Science"]
    assert list(response.keywords_ar) == []
