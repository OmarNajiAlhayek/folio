"""Shared scoring helpers for bi-encoder cosine and cross-encoder rerank."""

from __future__ import annotations

import math
from collections import defaultdict


def cosine_similarity(a: list[float], b: list[float]) -> float:
    """Cosine similarity between two vectors, clamped to [0, 1]."""
    if len(a) != len(b):
        raise ValueError("embedding dimensions must match")
    dot = sum(x * y for x, y in zip(a, b, strict=True))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(x * x for x in b))
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    sim = dot / (norm_a * norm_b)
    return max(0.0, min(1.0, sim))


def normalize_cross_encoder_score(raw: float) -> float:
    """Map STS-B cross-encoder logits to (0, 1) via sigmoid."""
    return 1.0 / (1.0 + math.exp(-raw))


def mean_scores_by_reviewer(
    reviewer_ids_per_pair: list[str],
    normalized_scores: list[float],
) -> dict[str, float]:
    """Average normalized CE scores per reviewer from flat pair-aligned lists."""
    if len(reviewer_ids_per_pair) != len(normalized_scores):
        raise ValueError("reviewer_ids_per_pair and normalized_scores length mismatch")
    buckets: dict[str, list[float]] = defaultdict(list)
    for reviewer_id, score in zip(reviewer_ids_per_pair, normalized_scores, strict=True):
        buckets[reviewer_id].append(score)
    return {rid: sum(vals) / len(vals) for rid, vals in buckets.items()}
