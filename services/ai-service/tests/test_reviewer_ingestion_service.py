"""Unit tests for ReviewerIngestionService."""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from app.ml.vector.config import VectorConfig
from app.ml.vector.reviewer_ingestion_service import ReviewerIngestionService


@pytest.fixture
def mock_engine() -> MagicMock:
    engine = MagicMock()
    engine.embed.return_value = [[0.1, 0.2, 0.3]]
    reviewers = MagicMock()
    history = MagicMock()
    summary = MagicMock()
    reviewers.get.return_value = {"ids": []}
    history.get.return_value = {"ids": []}
    summary.get.return_value = {"ids": []}
    engine.reviewers_collection = reviewers
    engine.reviewer_history_collection = history
    engine.summary_collection = summary
    return engine


@pytest.fixture
def mock_articles() -> MagicMock:
    return MagicMock()


def test_upsert_reviewer_empty_bio_deletes_existing(
    mock_engine: MagicMock,
    mock_articles: MagicMock,
) -> None:
    mock_engine.reviewers_collection.get.return_value = {"ids": ["r1"]}
    svc = ReviewerIngestionService(
        engine=mock_engine,
        config=VectorConfig(),
        article_ingestion=mock_articles,
    )

    svc.upsert_reviewer("r1", "   ")

    mock_engine.reviewers_collection.delete.assert_called_once_with(ids=["r1"])
    mock_engine.reviewers_collection.add.assert_not_called()


def test_upsert_reviewer_indexes_bio(
    mock_engine: MagicMock,
    mock_articles: MagicMock,
) -> None:
    svc = ReviewerIngestionService(
        engine=mock_engine,
        config=VectorConfig(),
        article_ingestion=mock_articles,
    )

    svc.upsert_reviewer("r1", "machine learning", display_name="Ada")

    mock_engine.reviewers_collection.add.assert_called_once()
    call = mock_engine.reviewers_collection.add.call_args
    assert call.kwargs["ids"] == ["r1"]
    assert call.kwargs["metadatas"] == [{"display_name": "Ada"}]


def test_upsert_review_history_delegates_to_summary(
    mock_engine: MagicMock,
    mock_articles: MagicMock,
) -> None:
    svc = ReviewerIngestionService(
        engine=mock_engine,
        config=VectorConfig(),
        article_ingestion=mock_articles,
    )

    svc.upsert_review_history("r1", "s1", "abstract text", "kw1, kw2")

    mock_articles.upsert_submission_summary.assert_called_once_with(
        "s1",
        "abstract text",
        "kw1, kw2",
        category="",
    )
    mock_engine.reviewer_history_collection.add.assert_not_called()


def test_upsert_review_history_requires_content(
    mock_engine: MagicMock,
    mock_articles: MagicMock,
) -> None:
    mock_articles.upsert_submission_summary.side_effect = ValueError(
        "abstract or keywords required to index summary",
    )
    svc = ReviewerIngestionService(
        engine=mock_engine,
        config=VectorConfig(),
        article_ingestion=mock_articles,
    )

    with pytest.raises(ValueError, match="abstract or keywords"):
        svc.upsert_review_history("r1", "s1", "", "")


def test_remove_reviewer_clears_bio_and_legacy_history(
    mock_engine: MagicMock,
    mock_articles: MagicMock,
) -> None:
    svc = ReviewerIngestionService(
        engine=mock_engine,
        config=VectorConfig(),
        article_ingestion=mock_articles,
    )

    svc.remove_reviewer("r1")

    mock_engine.reviewers_collection.delete.assert_called_once_with(ids=["r1"])
    mock_engine.reviewer_history_collection.delete.assert_called_once_with(
        where={"reviewer_id": {"$eq": "r1"}},
    )
