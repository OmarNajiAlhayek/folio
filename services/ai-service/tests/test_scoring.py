"""Unit tests for vector scoring helpers."""

from __future__ import annotations

import math

import pytest

from app.ml.vector.scoring import (
    cosine_similarity,
    mean_scores_by_reviewer,
    normalize_cross_encoder_score,
)


def test_cosine_similarity_identical() -> None:
    v = [1.0, 0.0, 0.0]
    assert cosine_similarity(v, v) == pytest.approx(1.0)


def test_cosine_similarity_orthogonal() -> None:
    assert cosine_similarity([1.0, 0.0], [0.0, 1.0]) == pytest.approx(0.0)


def test_cosine_similarity_zero_vector() -> None:
    assert cosine_similarity([0.0, 0.0], [1.0, 0.0]) == 0.0


def test_normalize_cross_encoder_score_sigmoid() -> None:
    assert normalize_cross_encoder_score(0.0) == pytest.approx(0.5)
    assert normalize_cross_encoder_score(-2.0) == pytest.approx(1.0 / (1.0 + math.exp(2.0)))
    assert normalize_cross_encoder_score(2.0) == pytest.approx(1.0 / (1.0 + math.exp(-2.0)))


def test_mean_scores_by_reviewer() -> None:
    means = mean_scores_by_reviewer(
        ["a", "a", "b"],
        [0.2, 0.4, 1.0],
    )
    assert means["a"] == pytest.approx(0.3)
    assert means["b"] == pytest.approx(1.0)


def test_mean_scores_by_reviewer_length_mismatch() -> None:
    with pytest.raises(ValueError, match="length mismatch"):
        mean_scores_by_reviewer(["a"], [0.1, 0.2])
