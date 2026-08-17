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
        return_value={
            "local_matches": [
                {
                    "submission_chunk_index": 0,
                    "submission_snippet": "Our methods extend prior work.",
                    "source_article_id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
                    "source_chunk_index": 1,
                    "matched_snippet": "methods extend prior",
                    "similarity": 0.91,
                },
            ],
            "web_matches": [
                {
                    "query_snippet": "Our methods extend prior work.",
                    "source_url": "https://example.com/article",
                    "matched_snippet": "methods extend prior research",
                    "similarity": 82.5,
                },
            ],
            "exact_report": {
                "total_tokens": 1000,
                "matched_tokens": 250,
                "overall_ratio": 0.25,
                "quoted_tokens": 40,
                "reference_tokens_skipped": 120,
                "sources": [
                    {
                        "doc_id": "11111111-2222-4333-8444-555555555555",
                        "source_kind": "external_oa",
                        "source_ref": "oai:journal/article/55",
                        "title": "عنوان البحث",
                        "source_url": "https://journal.example/article/55",
                        "submission_id": None,
                        "matched_tokens": 250,
                        "overlap_ratio": 0.25,
                        "spans": [
                            {
                                "submission_start_token": 10,
                                "submission_end_token": 40,
                                "submission_snippet": "verbatim run",
                                "matched_snippet": "verbatim run",
                                "token_length": 30,
                                "quoted": True,
                            },
                        ],
                    },
                ],
            },
            "exact_error": None,
            "local_error": None,
            "web_error": None,
        },
    )
    service.status = lambda: {"enabled": True}  # type: ignore[method-assign, assignment]
    return service


@pytest.fixture
async def grpc_channel(
    mock_similarity_service: SimilarityService,
    reviewer_matching_grpc_service,
    copyedit_grpc_service,
):
    classifier = ClassifierService(Settings(arabert_enabled=False))
    keywords = KeywordSuggestionService(Settings(keywords_suggestion_enabled=False))
    settings = Settings(grpc_port=0, ai_service_token="")
    server, port = await start_grpc_server(
        classifier,
        keywords,
        mock_similarity_service,
        reviewer_matching_grpc_service,
        copyedit_grpc_service,
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
    assert len(response.local_matches) == 1
    assert response.local_matches[0].similarity == pytest.approx(0.91)
    assert len(response.web_matches) == 1
    assert response.web_matches[0].similarity == pytest.approx(82.5)


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
    copyedit_grpc_service,
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
        copyedit_grpc_service,
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


@pytest.mark.asyncio
async def test_detect_corpus_similarity_returns_exact_matches(
    grpc_channel: grpc.aio.Channel,
) -> None:
    """The exact-overlap stage must survive protobuf round-tripping intact."""
    stub = plagiarism_pb2_grpc.PlagiarismServiceStub(grpc_channel)
    response = await stub.DetectCorpusSimilarity(
        plagiarism_pb2.DetectCorpusSimilarityRequest(
            submission_text="Our methods extend prior work.",
            submission_id="99999999-8888-4777-8666-555555555555",
        ),
    )

    assert response.HasField("exact_matches")
    report = response.exact_matches
    assert report.total_tokens == 1000
    assert report.matched_tokens == 250
    assert report.overall_ratio == pytest.approx(0.25)
    assert report.quoted_tokens == 40
    assert report.reference_tokens_skipped == 120

    assert len(report.sources) == 1
    source = report.sources[0]
    assert source.source_kind == "external_oa"
    assert source.source_url == "https://journal.example/article/55"
    # Optional field must stay unset rather than serializing an empty string,
    # because the backend keys its published re-check off its presence.
    assert not source.HasField("submission_id")

    assert len(source.spans) == 1
    span = source.spans[0]
    assert span.token_length == 30
    assert span.quoted is True
    assert span.submission_start_token == 10


@pytest.mark.asyncio
async def test_submission_id_reaches_the_service(
    mock_similarity_service: SimilarityService,
    grpc_channel: grpc.aio.Channel,
) -> None:
    """Without this the manuscript matches its own indexed copy at ~100%."""
    stub = plagiarism_pb2_grpc.PlagiarismServiceStub(grpc_channel)
    await stub.DetectCorpusSimilarity(
        plagiarism_pb2.DetectCorpusSimilarityRequest(
            submission_text="text",
            submission_id="99999999-8888-4777-8666-555555555555",
        ),
    )
    kwargs = mock_similarity_service.detect_corpus_similarity.await_args.kwargs
    assert kwargs["submission_id"] == "99999999-8888-4777-8666-555555555555"


@pytest.mark.asyncio
async def test_submission_id_omitted_stays_none(
    mock_similarity_service: SimilarityService,
    grpc_channel: grpc.aio.Channel,
) -> None:
    stub = plagiarism_pb2_grpc.PlagiarismServiceStub(grpc_channel)
    await stub.DetectCorpusSimilarity(
        plagiarism_pb2.DetectCorpusSimilarityRequest(submission_text="text"),
    )
    kwargs = mock_similarity_service.detect_corpus_similarity.await_args.kwargs
    assert kwargs["submission_id"] is None
