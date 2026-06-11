"""Unit tests for ReviewerIngestionService."""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from app.ml.vector.config import VectorConfig
from app.ml.vector.reviewer_ingestion_service import ReviewerIngestionService


@pytest.fixture
def mock_store() -> MagicMock:
    return MagicMock()


@pytest.fixture
def mock_engine(mock_store: MagicMock) -> MagicMock:
    engine = MagicMock()
    engine.embed.return_value = [[0.1, 0.2, 0.3]]
    engine.store = mock_store
    return engine


@pytest.fixture
def mock_articles() -> MagicMock:
    return MagicMock()


def test_upsert_reviewer_empty_bio_deletes_existing(
    mock_engine: MagicMock,
    mock_store: MagicMock,
    mock_articles: MagicMock,
) -> None:
    svc = ReviewerIngestionService(
        engine=mock_engine,
        config=VectorConfig(),
        article_ingestion=mock_articles,
    )

    svc.upsert_reviewer("r1", "   ")

    mock_store.delete_reviewer_bio.assert_called_once_with("r1")
    mock_store.upsert_reviewer_bio.assert_not_called()


def test_upsert_reviewer_indexes_bio(
    mock_engine: MagicMock,
    mock_store: MagicMock,
    mock_articles: MagicMock,
) -> None:
    svc = ReviewerIngestionService(
        engine=mock_engine,
        config=VectorConfig(),
        article_ingestion=mock_articles,
    )

    svc.upsert_reviewer("r1", "machine learning", display_name="Ada")

    mock_store.upsert_reviewer_bio.assert_called_once()
    row = mock_store.upsert_reviewer_bio.call_args.args[0]
    assert row.reviewer_id == "r1"
    assert row.display_name == "Ada"


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


def test_remove_reviewer_clears_bio(
    mock_engine: MagicMock,
    mock_store: MagicMock,
    mock_articles: MagicMock,
) -> None:
    svc = ReviewerIngestionService(
        engine=mock_engine,
        config=VectorConfig(),
        article_ingestion=mock_articles,
    )

    svc.remove_reviewer("r1")

    mock_store.delete_reviewer_bio.assert_called_once_with("r1")
