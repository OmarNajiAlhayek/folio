from __future__ import annotations

from unittest.mock import AsyncMock

import grpc
import pytest
from folio.ai.v1 import plagiarism_pb2, plagiarism_pb2_grpc

from app.config import Settings
from app.grpc.server import start_grpc_server, stop_grpc_server
from app.services.classifier_service import ClassifierService
from app.services.keyword_suggestion_service import KeywordSuggestionService
from app.services.similarity_service import SimilarityDisabledError, SimilarityService


@pytest.fixture
def mock_similarity_service() -> SimilarityService:
    settings = Settings(similarity_enabled=True)
    service = SimilarityService(settings)
    service.detect_corpus_similarity = AsyncMock(  # type: ignore[method-assign]
        return_value=[
            {
                "submission_chunk_index": 0,
                "submission_snippet": "Our methods extend prior work.",
                "source_article_id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
                "source_chunk_index": 1,
                "matched_snippet": "methods extend prior",
                "similarity": 0.91,
            },
        ],
    )
    service.status = lambda: {"enabled": True}  # type: ignore[method-assign, assignment]
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
async def test_detect_corpus_similarity_success(
    grpc_channel: grpc.aio.Channel,
) -> None:
    stub = plagiarism_pb2_grpc.PlagiarismServiceStub(grpc_channel)
    response = await stub.DetectCorpusSimilarity(
        plagiarism_pb2.DetectCorpusSimilarityRequest(
            submission_text="A long enough submission body for corpus similarity checking.",
        ),
    )
    assert len(response.matches) == 1
    assert response.matches[0].similarity == pytest.approx(0.91)


@pytest.mark.asyncio
async def test_detect_corpus_similarity_invalid_argument(
    grpc_channel: grpc.aio.Channel,
) -> None:
    stub = plagiarism_pb2_grpc.PlagiarismServiceStub(grpc_channel)
    with pytest.raises(grpc.aio.AioRpcError) as exc_info:
        await stub.DetectCorpusSimilarity(
            plagiarism_pb2.DetectCorpusSimilarityRequest(submission_text="   "),
        )
    assert exc_info.value.code() == grpc.StatusCode.INVALID_ARGUMENT


@pytest.mark.asyncio
async def test_detect_corpus_similarity_failed_precondition(
    mock_similarity_service: SimilarityService,
    reviewer_matching_grpc_service,
) -> None:
    mock_similarity_service.detect_corpus_similarity = AsyncMock(  # type: ignore[method-assign]
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
    stub = plagiarism_pb2_grpc.PlagiarismServiceStub(channel)
    try:
        with pytest.raises(grpc.aio.AioRpcError) as exc_info:
            await stub.DetectCorpusSimilarity(
                plagiarism_pb2.DetectCorpusSimilarityRequest(
                    submission_text="Enough text for the plagiarism servicer to accept.",
                ),
            )
        assert exc_info.value.code() == grpc.StatusCode.FAILED_PRECONDITION
    finally:
        await channel.close()
        await stop_grpc_server(server)
