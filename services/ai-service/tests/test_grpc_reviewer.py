from __future__ import annotations

from unittest.mock import AsyncMock

import grpc
import pytest
from folio.ai.v1 import reviewer_pb2, reviewer_pb2_grpc

from app.config import Settings
from app.grpc.server import start_grpc_server, stop_grpc_server
from app.services.classifier_service import ClassifierService
from app.services.keyword_suggestion_service import KeywordSuggestionService
from app.services.reviewer_matching_grpc_service import ReviewerMatchingGrpcService
from app.services.similarity_service import SimilarityService


@pytest.fixture
def mock_reviewer_service() -> ReviewerMatchingGrpcService:
    service = ReviewerMatchingGrpcService(Settings(reviewer_matching_enabled=True))
    service.suggest_reviewers = AsyncMock(  # type: ignore[method-assign]
        return_value=[
            {
                "reviewer_id": "r1",
                "final_score": 0.9,
                "bio_score": 0.8,
                "history_score": 0.85,
                "ce_bio_score": 0.88,
                "ce_history_score": 0.87,
                "used_cross_encoder": True,
            },
        ],
    )
    return service


@pytest.fixture
async def grpc_channel(mock_reviewer_service: ReviewerMatchingGrpcService):
    classifier = ClassifierService(Settings(arabert_enabled=False))
    keywords = KeywordSuggestionService(Settings(keywords_suggestion_enabled=False))
    similarity = SimilarityService(Settings(similarity_enabled=False))
    settings = Settings(grpc_port=0, ai_service_token="")
    server, port = await start_grpc_server(
        classifier,
        keywords,
        similarity,
        mock_reviewer_service,
        settings,
    )
    channel = grpc.aio.insecure_channel(f"localhost:{port}")
    try:
        yield channel
    finally:
        await channel.close()
        await stop_grpc_server(server)


@pytest.mark.asyncio
async def test_suggest_reviewers_success(grpc_channel: grpc.aio.Channel) -> None:
    stub = reviewer_pb2_grpc.ReviewerMatchingServiceStub(grpc_channel)
    response = await stub.SuggestReviewers(
        reviewer_pb2.SuggestReviewersRequest(
            query_text="machine learning natural language",
            index_profiles=[
                reviewer_pb2.ReviewerProfile(
                    reviewer_id="r1",
                    affiliation="CS department",
                    review_keywords="NLP",
                ),
            ],
        ),
    )
    assert len(response.hits) == 1
    assert response.hits[0].reviewer_id == "r1"
    assert response.hits[0].final_score == pytest.approx(0.9)
