"""Unit tests for ReviewerMatchingService."""

from __future__ import annotations

import math
from unittest.mock import MagicMock

import pytest

from app.ml.vector.config import VectorConfig
from app.ml.vector.reviewer_matching_service import ReviewerMatchingService


def _vec(x: float, y: float, z: float) -> list[float]:
    return [x, y, z]


@pytest.fixture
def mock_engine() -> MagicMock:
    engine = MagicMock()
    reviewers = MagicMock()
    history = MagicMock()
    engine.reviewers_collection = reviewers
    engine.reviewer_history_collection = history
    return engine


def _setup_bios(mock_engine: MagicMock, bios: dict[str, list[float]]) -> None:
    def reviewers_get(*, ids=None, include=None):  # noqa: ANN001
        if ids is None:
            return {"ids": list(bios.keys())}
        found_ids = []
        embeddings = []
        documents = []
        for rid in ids:
            if rid in bios:
                found_ids.append(rid)
                embeddings.append(bios[rid])
                documents.append(f"bio-{rid}")
        return {"ids": found_ids, "embeddings": embeddings, "documents": documents}

    mock_engine.reviewers_collection.get.side_effect = reviewers_get


def _setup_history(
    mock_engine: MagicMock,
    rows: list[tuple[str, list[float], str]],
) -> None:
    def history_get(*, where=None, include=None):  # noqa: ANN001
        reviewer_ids = set(where["reviewer_id"]["$in"]) if where else set()
        ids = []
        embeddings = []
        documents = []
        metadatas = []
        for rid, emb, doc in rows:
            if rid in reviewer_ids:
                ids.append(f"{rid}::sub")
                embeddings.append(emb)
                documents.append(doc)
                metadatas.append({"reviewer_id": rid, "submission_id": "sub"})
        return {
            "ids": ids,
            "embeddings": embeddings,
            "documents": documents,
            "metadatas": metadatas,
        }

    mock_engine.reviewer_history_collection.get.side_effect = history_get


def test_empty_query_returns_empty(mock_engine: MagicMock) -> None:
    svc = ReviewerMatchingService(engine=mock_engine, config=VectorConfig())
    assert svc.suggest_reviewers("   ") == []


def test_zero_weights_raises(mock_engine: MagicMock) -> None:
    svc = ReviewerMatchingService(engine=mock_engine, config=VectorConfig())
    with pytest.raises(ValueError, match="cannot both be zero"):
        svc.suggest_reviewers("query", bio_weight=0.0, history_weight=0.0)


def test_stage1_ordering_without_cross_encoder(mock_engine: MagicMock) -> None:
    _setup_bios(
        mock_engine,
        {
            "low": _vec(0.0, 1.0, 0.0),
            "high": _vec(1.0, 0.0, 0.0),
        },
    )
    _setup_history(mock_engine, [])
    mock_engine.embed.return_value = [_vec(1.0, 0.0, 0.0)]

    svc = ReviewerMatchingService(engine=mock_engine, config=VectorConfig())
    hits = svc.suggest_reviewers(
        "query",
        use_cross_encoder=False,
        limit=2,
        bio_weight=1.0,
        history_weight=0.0,
    )

    assert [h.reviewer_id for h in hits] == ["high", "low"]
    assert hits[0].used_cross_encoder is False
    assert hits[0].ce_bio_score is None
    mock_engine.rerank.assert_not_called()


def test_exclude_reviewer_ids(mock_engine: MagicMock) -> None:
    _setup_bios(
        mock_engine,
        {"a": _vec(1.0, 0.0, 0.0), "b": _vec(0.9, 0.1, 0.0)},
    )
    _setup_history(mock_engine, [])
    mock_engine.embed.return_value = [_vec(1.0, 0.0, 0.0)]

    svc = ReviewerMatchingService(engine=mock_engine, config=VectorConfig())
    hits = svc.suggest_reviewers(
        "q",
        candidate_ids=["a", "b"],
        exclude_reviewer_ids=["b"],
        use_cross_encoder=False,
        limit=5,
        bio_weight=1.0,
        history_weight=0.0,
    )

    assert [h.reviewer_id for h in hits] == ["a"]


def test_no_history_uses_bio_fallback(mock_engine: MagicMock) -> None:
    _setup_bios(mock_engine, {"r1": _vec(1.0, 0.0, 0.0)})
    _setup_history(mock_engine, [])
    mock_engine.embed.return_value = [_vec(1.0, 0.0, 0.0)]

    svc = ReviewerMatchingService(engine=mock_engine, config=VectorConfig())
    hits = svc.suggest_reviewers(
        "q",
        use_cross_encoder=False,
        limit=1,
        bio_weight=0.5,
        history_weight=0.5,
    )

    assert hits[0].bio_score == hits[0].history_score


def test_multiple_history_rows_use_mean(mock_engine: MagicMock) -> None:
    _setup_bios(mock_engine, {"r1": _vec(1.0, 0.0, 0.0)})
    mock_engine.embed.return_value = [_vec(1.0, 0.0, 0.0)]

    def history_get(*, where=None, include=None):  # noqa: ANN001
        return {
            "ids": ["r1::s1", "r1::s2"],
            "embeddings": [_vec(1.0, 0.0, 0.0), _vec(0.0, 1.0, 0.0)],
            "documents": ["hist1", "hist2"],
            "metadatas": [
                {"reviewer_id": "r1", "submission_id": "s1"},
                {"reviewer_id": "r1", "submission_id": "s2"},
            ],
        }

    mock_engine.reviewer_history_collection.get.side_effect = history_get

    svc = ReviewerMatchingService(engine=mock_engine, config=VectorConfig())
    hits = svc.suggest_reviewers(
        "q",
        use_cross_encoder=False,
        limit=1,
        bio_weight=0.0,
        history_weight=1.0,
    )

    assert hits[0].history_score == pytest.approx(0.5)


def test_cross_encoder_two_batch_calls_and_mapping(mock_engine: MagicMock) -> None:
    _setup_bios(
        mock_engine,
        {"a": _vec(1.0, 0.0, 0.0), "b": _vec(0.5, 0.5, 0.0)},
    )
    mock_engine.embed.return_value = [_vec(1.0, 0.0, 0.0)]

    def history_get(*, where=None, include=None):  # noqa: ANN001
        return {
            "ids": ["a::1", "a::2", "a::3", "b::1"],
            "embeddings": [
                _vec(1.0, 0.0, 0.0),
                _vec(1.0, 0.0, 0.0),
                _vec(1.0, 0.0, 0.0),
                _vec(0.0, 1.0, 0.0),
            ],
            "documents": ["a1", "a2", "a3", "b1"],
            "metadatas": [
                {"reviewer_id": "a", "submission_id": "1"},
                {"reviewer_id": "a", "submission_id": "2"},
                {"reviewer_id": "a", "submission_id": "3"},
                {"reviewer_id": "b", "submission_id": "1"},
            ],
        }

    mock_engine.reviewer_history_collection.get.side_effect = history_get

    bio_scores = [3.0, 1.0]
    history_scores = [6.0, 5.0, 4.0, 2.0]
    mock_engine.rerank.side_effect = [bio_scores, history_scores]

    cfg = VectorConfig(reviewer_rerank_top_k=10, reviewer_default_limit=2)
    svc = ReviewerMatchingService(engine=mock_engine, config=cfg)
    hits = svc.suggest_reviewers(
        "q",
        use_cross_encoder=True,
        limit=2,
        bio_weight=0.5,
        history_weight=0.5,
    )

    assert mock_engine.rerank.call_count == 2
    assert len(mock_engine.rerank.call_args_list[0][0][0]) == 2
    assert len(mock_engine.rerank.call_args_list[1][0][0]) == 4

    by_id = {h.reviewer_id: h for h in hits}
    assert by_id["a"].ce_history_score == pytest.approx(
        sum(1.0 / (1.0 + math.exp(-s)) for s in [6.0, 5.0, 4.0]) / 3,
    )
    assert by_id["b"].ce_history_score == pytest.approx(
        1.0 / (1.0 + math.exp(-2.0)),
    )
    assert by_id["a"].used_cross_encoder is True


def test_effective_rerank_k_at_least_limit(mock_engine: MagicMock) -> None:
    bios = {f"r{i}": _vec(1.0 - i * 0.01, 0.0, 0.0) for i in range(5)}
    _setup_bios(mock_engine, bios)
    _setup_history(mock_engine, [])
    mock_engine.embed.return_value = [_vec(1.0, 0.0, 0.0)]
    mock_engine.rerank.side_effect = lambda pairs: [1.0] * len(pairs)

    cfg = VectorConfig(reviewer_rerank_top_k=2, reviewer_default_limit=4)
    svc = ReviewerMatchingService(engine=mock_engine, config=cfg)
    hits = svc.suggest_reviewers("q", use_cross_encoder=True, limit=4)

    assert len(hits) == 4
