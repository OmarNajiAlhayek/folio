from __future__ import annotations

from unittest.mock import AsyncMock

import grpc
import pytest
from folio.ai.v1 import similarity_pb2, similarity_pb2_grpc

from app.config import Settings
from app.grpc.server import start_grpc_server, stop_grpc_server
from app.services.classifier_service import ClassifierService
from app.services.keyword_suggestion_service import KeywordSuggestionService
from app.services.similarity_service import SimilarityDisabledError, SimilarityService


@pytest.fixture
def mock_similarity_service() -> SimilarityService:
    settings = Settings(similarity_enabled=True)
    service = SimilarityService(settings)
    service.upsert_article = AsyncMock()  # type: ignore[method-assign]
    service.remove_article = AsyncMock()  # type: ignore[method-assign]
    service.find_similar = AsyncMock(  # type: ignore[method-assign]
        return_value=[
            {
                "article_id": "peer-1",
                "abstract": "Related abstract",
                "keywords": "kw",
                "category": "cat",
                "similarity": 0.88,
            },
        ],
    )
    service.semantic_search = AsyncMock(  # type: ignore[method-assign]
        return_value=[
            {
                "article_id": "hit-1",
                "snippet": "matching snippet",
                "score": 0.75,
            },
        ],
    )
    service.status = lambda: {  # type: ignore[method-assign, assignment]
        "enabled": True,
        "chroma_path": "/tmp/chroma",
        "model_name": "test-model",
        "default_threshold": 0.7,
        "same_category_only": False,
    }
    return service


@pytest.fixture
async def grpc_channel(
    mock_similarity_service: SimilarityService,
    reviewer_matching_grpc_service,
):
    classifier = ClassifierService(Settings(arabert_enabled=False))
    keywords = KeywordSuggestionService(Settings(keywords_suggestion_enabled=False))
    settings = Settings(grpc_port=0, ai_service_token="")
    server, port = await start_grpc_server(
        classifier,
        keywords,
        mock_similarity_service,
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
async def test_upsert_article_success(grpc_channel: grpc.aio.Channel) -> None:
    stub = similarity_pb2_grpc.SimilarityServiceStub(grpc_channel)
    response = await stub.UpsertArticle(
        similarity_pb2.UpsertArticleRequest(
            article_id="article-1",
            abstract="A valid abstract for indexing.",
        ),
    )
    assert response.status == "ok"


@pytest.mark.asyncio
async def test_find_similar_articles_success(grpc_channel: grpc.aio.Channel) -> None:
    stub = similarity_pb2_grpc.SimilarityServiceStub(grpc_channel)
    response = await stub.FindSimilarArticles(
        similarity_pb2.FindSimilarArticlesRequest(article_id="article-1"),
    )
    assert len(response.hits) == 1
    assert response.hits[0].article_id == "peer-1"
    assert response.hits[0].similarity == pytest.approx(0.88)


@pytest.mark.asyncio
async def test_semantic_search_success(grpc_channel: grpc.aio.Channel) -> None:
    stub = similarity_pb2_grpc.SimilarityServiceStub(grpc_channel)
    response = await stub.SemanticSearch(
        similarity_pb2.SemanticSearchRequest(query="machine learning"),
    )
    assert len(response.hits) == 1
    assert response.hits[0].score == pytest.approx(0.75)


@pytest.mark.asyncio
async def test_get_similarity_status(grpc_channel: grpc.aio.Channel) -> None:
    stub = similarity_pb2_grpc.SimilarityServiceStub(grpc_channel)
    response = await stub.GetSimilarityStatus(
        similarity_pb2.GetSimilarityStatusRequest(),
    )
    assert response.enabled is True
    assert response.model_name == "test-model"


@pytest.mark.asyncio
async def test_upsert_invalid_argument(grpc_channel: grpc.aio.Channel) -> None:
    stub = similarity_pb2_grpc.SimilarityServiceStub(grpc_channel)
    with pytest.raises(grpc.aio.AioRpcError) as exc_info:
        await stub.UpsertArticle(
            similarity_pb2.UpsertArticleRequest(article_id="", abstract=""),
        )
    assert exc_info.value.code() == grpc.StatusCode.INVALID_ARGUMENT


@pytest.mark.asyncio
async def test_semantic_search_failed_precondition(
    mock_similarity_service: SimilarityService,
    reviewer_matching_grpc_service,
) -> None:
    mock_similarity_service.semantic_search = AsyncMock(  # type: ignore[method-assign]
        side_effect=SimilarityDisabledError("disabled"),
    )
    classifier = ClassifierService(Settings(arabert_enabled=False))
    keywords = KeywordSuggestionService(Settings(keywords_suggestion_enabled=False))
    settings = Settings(grpc_port=0, ai_service_token="")
    server, port = await start_grpc_server(
        classifier,
        keywords,
        mock_similarity_service,
        reviewer_matching_grpc_service,
        settings,
    )
    channel = grpc.aio.insecure_channel(f"localhost:{port}")
    stub = similarity_pb2_grpc.SimilarityServiceStub(channel)
    try:
        with pytest.raises(grpc.aio.AioRpcError) as exc_info:
            await stub.SemanticSearch(
                similarity_pb2.SemanticSearchRequest(query="test query"),
            )
        assert exc_info.value.code() == grpc.StatusCode.FAILED_PRECONDITION
    finally:
        await channel.close()
        await stop_grpc_server(server)
