"""Two-stage reviewer suggestion: bi-encoder retrieval + cross-encoder rerank."""

from __future__ import annotations

import logging
from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

from app.ml.vector.ai_engine import AIEngine
from app.ml.vector.config import VectorConfig
from app.ml.vector.scoring import (
    cosine_similarity,
    mean_scores_by_reviewer,
    normalize_cross_encoder_score,
)
from app.ml.vector.text_processing import clean_text
from app.ml.vector.types import ReviewerSuggestionHit

logger = logging.getLogger(__name__)

_HISTORY_IN_BATCH_SIZE = 500


@dataclass
class _ReviewerHistoryRows:
    embeddings: list[list[float]]
    documents: list[str]


@dataclass
class _Stage1Candidate:
    reviewer_id: str
    bio_score: float
    history_score: float
    initial_final_score: float
    bio_document: str
    history_documents: list[str]


class ReviewerMatchingService:
    """
    Suggest reviewers for a submission query.

    Cold-start: reviewers with no history use bio_score for history_score (stage 1)
    and ce_bio_score for ce_history_score (stage 2).
    """

    def __init__(
        self,
        engine: AIEngine | None = None,
        config: VectorConfig | None = None,
    ) -> None:
        self._config = config or VectorConfig()
        self._engine = engine or AIEngine.get_instance(self._config)

    def suggest_reviewers(
        self,
        query_text: str,
        *,
        limit: int | None = None,
        candidate_ids: Sequence[str] | None = None,
        exclude_reviewer_ids: Sequence[str] | None = None,
        history_links: dict[str, list[str]] | None = None,
        bio_weight: float | None = None,
        history_weight: float | None = None,
        use_cross_encoder: bool = True,
        rerank_top_k: int | None = None,
    ) -> list[ReviewerSuggestionHit]:
        cfg = self._config
        resolved_limit = limit if limit is not None else cfg.reviewer_default_limit
        resolved_bio_w = bio_weight if bio_weight is not None else cfg.reviewer_bio_weight
        resolved_hist_w = (
            history_weight if history_weight is not None else cfg.reviewer_history_weight
        )
        resolved_rerank_k = (
            rerank_top_k if rerank_top_k is not None else cfg.reviewer_rerank_top_k
        )

        if resolved_bio_w + resolved_hist_w == 0:
            raise ValueError("bio_weight and history_weight cannot both be zero")

        effective_rerank_k = max(resolved_rerank_k, resolved_limit)

        cleaned_query = clean_text(query_text)
        if not cleaned_query:
            return []

        reviewer_ids = self._resolve_reviewer_ids(candidate_ids, exclude_reviewer_ids)
        if not reviewer_ids:
            return []

        bio_rows = self._load_bio_rows(reviewer_ids)
        if not bio_rows:
            return []

        query_vector = self._engine.embed([cleaned_query])[0]
        history_by_reviewer = self._load_history_grouped(
            reviewer_ids,
            history_links or {},
        )

        stage1: list[_Stage1Candidate] = []
        for reviewer_id, row in bio_rows.items():
            bio_embedding = _as_vector(row["embedding"])
            bio_score = cosine_similarity(query_vector, bio_embedding)
            history = history_by_reviewer.get(
                reviewer_id,
                _ReviewerHistoryRows(embeddings=[], documents=[]),
            )
            if history.embeddings:
                history_score = sum(
                    cosine_similarity(query_vector, emb) for emb in history.embeddings
                ) / len(history.embeddings)
            else:
                history_score = bio_score

            initial = resolved_bio_w * bio_score + resolved_hist_w * history_score
            stage1.append(
                _Stage1Candidate(
                    reviewer_id=reviewer_id,
                    bio_score=bio_score,
                    history_score=history_score,
                    initial_final_score=initial,
                    bio_document=row["document"],
                    history_documents=list(history.documents),
                ),
            )

        stage1.sort(key=lambda c: c.initial_final_score, reverse=True)
        shortlist = stage1[:effective_rerank_k]

        if not use_cross_encoder:
            return [
                ReviewerSuggestionHit(
                    reviewer_id=c.reviewer_id,
                    final_score=c.initial_final_score,
                    bio_score=c.bio_score,
                    history_score=c.history_score,
                    used_cross_encoder=False,
                )
                for c in shortlist[:resolved_limit]
            ]

        return self._rerank_shortlist(
            cleaned_query,
            shortlist,
            limit=resolved_limit,
            bio_weight=resolved_bio_w,
            history_weight=resolved_hist_w,
        )

    def _resolve_reviewer_ids(
        self,
        candidate_ids: Sequence[str] | None,
        exclude_reviewer_ids: Sequence[str] | None,
    ) -> set[str]:
        store = self._engine.store
        if candidate_ids is not None:
            ids = {str(rid).strip() for rid in candidate_ids if str(rid).strip()}
        else:
            ids = set(store.list_reviewer_ids())

        if exclude_reviewer_ids:
            exclude = {
                str(rid).strip() for rid in exclude_reviewer_ids if str(rid).strip()
            }
            ids -= exclude
        return ids

    def _load_bio_rows(self, reviewer_ids: set[str]) -> dict[str, dict[str, Any]]:
        if not reviewer_ids:
            return {}
        bios = self._engine.store.get_reviewer_bios(sorted(reviewer_ids))
        rows: dict[str, dict[str, Any]] = {}
        for bio in bios:
            rows[bio.reviewer_id] = {
                "embedding": bio.embedding,
                "document": bio.bio_text,
            }
        return rows

    def _load_history_grouped(
        self,
        reviewer_ids: set[str],
        history_links: dict[str, list[str]],
    ) -> dict[str, _ReviewerHistoryRows]:
        grouped: dict[str, _ReviewerHistoryRows] = defaultdict(
            lambda: _ReviewerHistoryRows(embeddings=[], documents=[]),
        )

        submission_ids: set[str] = set()
        for rid in reviewer_ids:
            for sid in history_links.get(rid, []):
                cleaned = str(sid).strip()
                if cleaned:
                    submission_ids.add(cleaned)

        if not submission_ids:
            return dict(grouped)

        by_submission: dict[str, tuple[list[float], str]] = {}
        id_list = sorted(submission_ids)
        store = self._engine.store
        for offset in range(0, len(id_list), _HISTORY_IN_BATCH_SIZE):
            batch = id_list[offset : offset + _HISTORY_IN_BATCH_SIZE]
            summaries = store.get_submission_summaries_by_ids(batch)
            for row in summaries:
                by_submission[row.submission_id] = (row.embedding, row.summary_text)

        for rid in reviewer_ids:
            row = grouped[rid]
            for sid in history_links.get(rid, []):
                cleaned = str(sid).strip()
                entry = by_submission.get(cleaned)
                if entry is None:
                    continue
                emb, doc = entry
                row.embeddings.append(emb)
                if doc:
                    row.documents.append(doc)

        return dict(grouped)

    def _rerank_shortlist(
        self,
        query_text: str,
        shortlist: list[_Stage1Candidate],
        *,
        limit: int,
        bio_weight: float,
        history_weight: float,
    ) -> list[ReviewerSuggestionHit]:
        bio_pairs = [(query_text, c.bio_document) for c in shortlist]
        history_pairs: list[tuple[str, str]] = []
        history_reviewer_ids: list[str] = []

        for candidate in shortlist:
            for hist_doc in candidate.history_documents:
                history_pairs.append((query_text, hist_doc))
                history_reviewer_ids.append(candidate.reviewer_id)

        raw_bio = self._engine.rerank(bio_pairs)
        raw_history = self._engine.rerank(history_pairs) if history_pairs else []

        norm_bio = [normalize_cross_encoder_score(s) for s in raw_bio]
        norm_history = [normalize_cross_encoder_score(s) for s in raw_history]
        history_means = mean_scores_by_reviewer(history_reviewer_ids, norm_history)

        hits: list[ReviewerSuggestionHit] = []
        for i, candidate in enumerate(shortlist):
            ce_bio = norm_bio[i]
            if candidate.history_documents:
                ce_hist = history_means[candidate.reviewer_id]
            else:
                ce_hist = ce_bio

            final = bio_weight * ce_bio + history_weight * ce_hist
            hits.append(
                ReviewerSuggestionHit(
                    reviewer_id=candidate.reviewer_id,
                    final_score=final,
                    bio_score=candidate.bio_score,
                    history_score=candidate.history_score,
                    ce_bio_score=ce_bio,
                    ce_history_score=ce_hist,
                    used_cross_encoder=True,
                ),
            )

        hits.sort(key=lambda h: h.final_score, reverse=True)
        return hits[:limit]


def _as_vector(embedding: Any) -> list[float]:
    if hasattr(embedding, "tolist"):
        return embedding.tolist()
    return list(embedding)
