"""Unit tests for ReviewerMatchingService."""

from __future__ import annotations

import math
from unittest.mock import MagicMock

import pytest

from app.ml.vector.config import VectorConfig
from app.ml.vector.reviewer_matching_service import ReviewerMatchingService
from app.ml.vector.vector_store import ReviewerBioRow, SubmissionSummaryLookup


def _vec(x: float, y: float, z: float) -> list[float]:
    return [x, y, z]


@pytest.fixture
def mock_store() -> MagicMock:
    return MagicMock()


@pytest.fixture
def mock_engine(mock_store: MagicMock) -> MagicMock:
    engine = MagicMock()
    engine.store = mock_store
    return engine


def _setup_bios(mock_store: MagicMock, bios: dict[str, list[float]]) -> None:
    def get_reviewer_bios(reviewer_ids: list[str]) -> list[ReviewerBioRow]:
        return [
            ReviewerBioRow(
                reviewer_id=rid,
                embedding=emb,
                bio_text=f"bio-{rid}",
            )
            for rid in reviewer_ids
            if rid in bios
            for emb in [bios[rid]]
        ]

    mock_store.get_reviewer_bios.side_effect = get_reviewer_bios


def _setup_summary_history(
    mock_store: MagicMock,
    submissions: dict[str, tuple[list[float], str]],
) -> None:
    def get_submission_summaries_by_ids(
        submission_ids: list[str],
    ) -> list[SubmissionSummaryLookup]:
        return [
            SubmissionSummaryLookup(
                submission_id=sid,
                embedding=submissions[sid][0],
                summary_text=submissions[sid][1],
            )
            for sid in submission_ids
            if sid in submissions
        ]

    mock_store.get_submission_summaries_by_ids.side_effect = get_submission_summaries_by_ids


def test_empty_query_returns_empty(mock_engine: MagicMock) -> None:
    svc = ReviewerMatchingService(engine=mock_engine, config=VectorConfig())
    assert svc.suggest_reviewers("   ") == []


def test_zero_weights_raises(mock_engine: MagicMock) -> None:
    svc = ReviewerMatchingService(engine=mock_engine, config=VectorConfig())
    with pytest.raises(ValueError, match="cannot both be zero"):
        svc.suggest_reviewers("query", bio_weight=0.0, history_weight=0.0)


def test_stage1_ordering_without_cross_encoder(mock_engine: MagicMock, mock_store: MagicMock) -> None:
    _setup_bios(
        mock_store,
        {
            "low": _vec(0.0, 1.0, 0.0),
            "high": _vec(1.0, 0.0, 0.0),
        },
    )
    mock_engine.embed.return_value = [_vec(1.0, 0.0, 0.0)]

    svc = ReviewerMatchingService(engine=mock_engine, config=VectorConfig())
    hits = svc.suggest_reviewers(
        "query",
        candidate_ids=["low", "high"],
        use_cross_encoder=False,
        limit=2,
    )

    assert [h.reviewer_id for h in hits] == ["high", "low"]
    assert hits[0].final_score >= hits[1].final_score


def test_history_links_boost_score(mock_engine: MagicMock, mock_store: MagicMock) -> None:
    _setup_bios(
        mock_store,
        {
            "a": _vec(1.0, 0.0, 0.0),
            "b": _vec(1.0, 0.0, 0.0),
        },
    )
    _setup_summary_history(
        mock_store,
        {
            "s1": (_vec(1.0, 0.0, 0.0), "history doc"),
            "s2": (_vec(0.0, 1.0, 0.0), "other doc"),
        },
    )
    mock_engine.embed.return_value = [_vec(1.0, 0.0, 0.0)]

    svc = ReviewerMatchingService(engine=mock_engine, config=VectorConfig())
    hits = svc.suggest_reviewers(
        "query",
        candidate_ids=["a", "b"],
        history_links={"a": ["s1"], "b": ["s2"]},
        use_cross_encoder=False,
        limit=2,
        bio_weight=0.0,
        history_weight=1.0,
    )

    assert hits[0].reviewer_id == "a"
    assert math.isclose(hits[0].history_score, 1.0)


def test_cross_encoder_rerank(mock_engine: MagicMock, mock_store: MagicMock) -> None:
    _setup_bios(mock_store, {"r1": _vec(1.0, 0.0, 0.0)})
    mock_engine.embed.return_value = [_vec(1.0, 0.0, 0.0)]
    mock_engine.rerank.return_value = [2.0]

    svc = ReviewerMatchingService(engine=mock_engine, config=VectorConfig())
    hits = svc.suggest_reviewers(
        "query",
        candidate_ids=["r1"],
        use_cross_encoder=True,
        limit=1,
    )

    assert len(hits) == 1
    assert hits[0].used_cross_encoder is True
    assert hits[0].ce_bio_score is not None
