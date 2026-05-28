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
    reviewers.get.return_value = {"ids": []}
    history.get.return_value = {"ids": []}
    engine.reviewers_collection = reviewers
    engine.reviewer_history_collection = history
    return engine


def test_upsert_reviewer_empty_bio_deletes_existing(mock_engine: MagicMock) -> None:
    mock_engine.reviewers_collection.get.return_value = {"ids": ["r1"]}
    svc = ReviewerIngestionService(engine=mock_engine, config=VectorConfig())

    svc.upsert_reviewer("r1", "   ")

    mock_engine.reviewers_collection.delete.assert_called_once_with(ids=["r1"])
    mock_engine.reviewers_collection.add.assert_not_called()


def test_upsert_reviewer_indexes_bio(mock_engine: MagicMock) -> None:
    svc = ReviewerIngestionService(engine=mock_engine, config=VectorConfig())

    svc.upsert_reviewer("r1", "machine learning", display_name="Ada")

    mock_engine.reviewers_collection.add.assert_called_once()
    call = mock_engine.reviewers_collection.add.call_args
    assert call.kwargs["ids"] == ["r1"]
    assert call.kwargs["metadatas"] == [{"display_name": "Ada"}]


def test_upsert_review_history_requires_content(mock_engine: MagicMock) -> None:
    svc = ReviewerIngestionService(engine=mock_engine, config=VectorConfig())

    with pytest.raises(ValueError, match="abstract or keywords"):
        svc.upsert_review_history("r1", "s1", "", "")


def test_remove_reviewer_clears_bio_and_history(mock_engine: MagicMock) -> None:
    svc = ReviewerIngestionService(engine=mock_engine, config=VectorConfig())

    svc.remove_reviewer("r1")

    mock_engine.reviewers_collection.delete.assert_called_once_with(ids=["r1"])
    mock_engine.reviewer_history_collection.delete.assert_called_once_with(
        where={"reviewer_id": {"$eq": "r1"}},
    )
