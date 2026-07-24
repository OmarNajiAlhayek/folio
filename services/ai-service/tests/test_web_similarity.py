"""Tests for web similarity helpers and orchestration."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from app.config import Settings
from app.ml.web_similarity.query_extract import extract_query_passages
from app.services.similarity_service import SimilarityService


def test_extract_query_passages_prefers_longest() -> None:
    text = "short\n\n" + ("x" * 100) + "\n\n" + ("y" * 200)
    passages = extract_query_passages(text, max_queries=2, min_chars=80)
    assert len(passages) == 2
    assert passages[0].startswith("y")
    assert passages[1].startswith("x")


@pytest.mark.asyncio
async def test_detect_corpus_similarity_runs_local_then_web() -> None:
    settings = Settings(
        similarity_enabled=True,
        web_similarity_enabled=True,
        google_cse_api_key="test-key",
        google_cse_id="test-cx",
    )
    service = SimilarityService(settings)

    local_match = MagicMock(
        submission_chunk_index=0,
        submission_snippet="local",
        source_article_id="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        source_chunk_index=0,
        matched_snippet="match",
        similarity=0.9,
    )
    web_match = MagicMock(
        query_snippet="query",
        source_url="https://example.com",
        matched_snippet="web",
        similarity=80.0,
    )

    with (
        patch.object(
            service,
            "_get_plagiarism_service",
            return_value=MagicMock(detect=MagicMock(return_value=[local_match])),
        ),
        patch.object(
            service,
            "_get_web_plagiarism_service",
            return_value=MagicMock(detect=MagicMock(return_value=[web_match])),
        ),
    ):
        result = await service.detect_corpus_similarity(
            "A" * 120 + "\n\n" + "B" * 120,
            threshold=0.85,
        )

    assert len(result["local_matches"]) == 1
    assert len(result["web_matches"]) == 1
    assert result["local_error"] is None
    assert result["web_error"] is None


@pytest.mark.asyncio
async def test_detect_corpus_similarity_partial_web_failure() -> None:
    settings = Settings(similarity_enabled=True, web_similarity_enabled=False)
    service = SimilarityService(settings)

    local_match = MagicMock(
        submission_chunk_index=0,
        submission_snippet="local",
        source_article_id="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        source_chunk_index=0,
        matched_snippet="match",
        similarity=0.9,
    )

    with patch.object(
        service,
        "_get_plagiarism_service",
        return_value=MagicMock(detect=MagicMock(return_value=[local_match])),
    ):
        result = await service.detect_corpus_similarity("A" * 120, threshold=0.85)

    assert len(result["local_matches"]) == 1
    assert result["web_matches"] == []
