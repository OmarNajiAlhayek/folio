from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import grpc
import pytest
from folio.ai.v1 import classifier_pb2, classifier_pb2_grpc

from app.config import Settings
from app.grpc.interceptors import ServiceTokenInterceptor
from app.grpc.server import start_grpc_server, stop_grpc_server
from app.grpc.servicer import ClassifierGrpcServicer
from app.services.classifier_service import ClassifierDisabledError, ClassifierService
from app.services.keyword_suggestion_service import KeywordSuggestionService
from app.services.similarity_service import SimilarityService


@pytest.fixture
def mock_keyword_service() -> KeywordSuggestionService:
    settings = Settings(keywords_suggestion_enabled=False)
    return KeywordSuggestionService(settings)


@pytest.fixture
def mock_similarity_service() -> SimilarityService:
    return SimilarityService(Settings(similarity_enabled=False))


@pytest.fixture
def mock_classifier_service() -> ClassifierService:
    settings = Settings(
        arabert_enabled=True,
        ai_service_token="",
    )
    service = ClassifierService(settings)
    service.classify_article = AsyncMock(  # type: ignore[method-assign]
        return_value={
            "top_label": "العلوم الطبية",
            "top_confidence": 90.0,
            "probabilities": {"العلوم الطبية": 90.0},
        },
    )
    service.classify_abstract = AsyncMock(  # type: ignore[method-assign]
        return_value={
            "top_label": "العلوم الطبية",
            "top_confidence": 88.0,
            "probabilities": {"العلوم الطبية": 88.0},
        },
    )
    service.status = MagicMock(  # type: ignore[method-assign]
        return_value={
            "enabled": True,
            "model_path": "/weights",
            "device": "cpu",
            "labels_count": 2,
            "weights_loaded": True,
            "model_configured": True,
        },
    )
    service.labels = MagicMock(return_value=["العلوم الطبية"])  # type: ignore[method-assign]
    return service


@pytest.fixture
async def grpc_channel(
    mock_classifier_service: ClassifierService,
    mock_keyword_service: KeywordSuggestionService,
    mock_similarity_service: SimilarityService,
    reviewer_matching_grpc_service,
):
    settings = Settings(grpc_port=0, ai_service_token="")
    server, port = await start_grpc_server(
        mock_classifier_service,
        mock_keyword_service,
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
async def test_classify_article_success(grpc_channel: grpc.aio.Channel) -> None:
    stub = classifier_pb2_grpc.ClassifierServiceStub(grpc_channel)
    response = await stub.ClassifyArticle(
        classifier_pb2.ClassifyArticleRequest(
            title="عنوان",
            keywords="كلمات",
            abstract="ملخص تجريبي",
        ),
    )
    assert response.top_label == "العلوم الطبية"
    assert response.top_confidence == 90.0


@pytest.mark.asyncio
async def test_classify_article_invalid_argument(grpc_channel: grpc.aio.Channel) -> None:
    stub = classifier_pb2_grpc.ClassifierServiceStub(grpc_channel)
    with pytest.raises(grpc.aio.AioRpcError) as exc_info:
        await stub.ClassifyArticle(
            classifier_pb2.ClassifyArticleRequest(title="", keywords="", abstract=""),
        )
    assert exc_info.value.code() == grpc.StatusCode.INVALID_ARGUMENT


@pytest.mark.asyncio
async def test_classify_article_failed_precondition(
    mock_classifier_service: ClassifierService,
    mock_keyword_service: KeywordSuggestionService,
    mock_similarity_service: SimilarityService,
    reviewer_matching_grpc_service,
) -> None:
    mock_classifier_service.classify_article = AsyncMock(  # type: ignore[method-assign]
        side_effect=ClassifierDisabledError("disabled"),
    )
    settings = Settings(grpc_port=0, ai_service_token="")
    server, port = await start_grpc_server(
        mock_classifier_service,
        mock_keyword_service,
        mock_similarity_service,
        reviewer_matching_grpc_service,
        settings,
    )
    channel = grpc.aio.insecure_channel(f"localhost:{port}")
    stub = classifier_pb2_grpc.ClassifierServiceStub(channel)
    try:
        with pytest.raises(grpc.aio.AioRpcError) as exc_info:
            await stub.ClassifyArticle(
                classifier_pb2.ClassifyArticleRequest(abstract="ملخص"),
            )
        assert exc_info.value.code() == grpc.StatusCode.FAILED_PRECONDITION
    finally:
        await channel.close()
        await stop_grpc_server(server)


@pytest.mark.asyncio
async def test_auth_interceptor_rejects_missing_token(
    mock_classifier_service: ClassifierService,
) -> None:
    settings = Settings(grpc_port=0, ai_service_token="secret-token")
    server = grpc.aio.server(interceptors=[ServiceTokenInterceptor(settings.ai_service_token)])
    classifier_pb2_grpc.add_ClassifierServiceServicer_to_server(
        ClassifierGrpcServicer(mock_classifier_service),
        server,
    )
    port = server.add_insecure_port("0.0.0.0:0")
    await server.start()
    channel = grpc.aio.insecure_channel(f"localhost:{port}")
    stub = classifier_pb2_grpc.ClassifierServiceStub(channel)
    try:
        with pytest.raises(grpc.aio.AioRpcError) as exc_info:
            await stub.GetClassifierStatus(classifier_pb2.GetClassifierStatusRequest())
        assert exc_info.value.code() == grpc.StatusCode.UNAUTHENTICATED
    finally:
        await channel.close()
        await server.stop(0)
