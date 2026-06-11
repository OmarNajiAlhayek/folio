"""Plagiarism detection via batched chunk queries against published articles."""

from __future__ import annotations

import logging

from app.ml.vector.ai_engine import AIEngine
from app.ml.vector.config import VectorConfig
from app.ml.vector.text_processing import chunk_text, clean_text
from app.ml.vector.types import PlagiarismMatch

logger = logging.getLogger(__name__)


class PlagiarismService:
    """
    Plagiarism Detection: compare submission chunks to published chunks.

    Submission chunks are embedded and queried in **batches** (default 200 embeddings per batch)
    to limit round-trips for very long documents.
    """

    def __init__(
        self,
        engine: AIEngine | None = None,
        config: VectorConfig | None = None,
    ) -> None:
        self._config = config or VectorConfig()
        self._engine = engine or AIEngine.get_instance(self._config)

    def detect(
        self,
        submission_text: str,
        *,
        threshold: float | None = None,
        n_results_per_chunk: int = 3,
        batch_size: int = 200,
        category: str | None = None,
    ) -> list[PlagiarismMatch]:
        """
        Find published chunks similar to the submission text.

        Returns matches with similarity >= ``threshold`` (default 0.85).
        """
        min_score = threshold if threshold is not None else self._config.plagiarism_threshold

        cleaned = clean_text(submission_text)
        chunks = chunk_text(cleaned, config=self._config)
        if not chunks:
            return []

        embeddings = self._engine.embed(chunks)
        category_filter = category.strip() if category is not None and category.strip() else None
        store = self._engine.store

        all_batch_results: list[list] = []
        total_batches = (len(embeddings) + batch_size - 1) // batch_size
        for batch_idx in range(0, len(embeddings), batch_size):
            batch_emb = embeddings[batch_idx : batch_idx + batch_size]
            logger.debug(
                "Querying batch %d/%d with %d embeddings",
                batch_idx // batch_size + 1,
                total_batches,
                len(batch_emb),
            )
            batch_hits = store.query_similar_chunks(
                batch_emb,
                limit_per_query=n_results_per_chunk,
                category=category_filter,
            )
            all_batch_results.extend(batch_hits)

        matches: list[PlagiarismMatch] = []
        for chunk_idx, submission_snippet in enumerate(chunks):
            for hit in all_batch_results[chunk_idx]:
                if hit.similarity < min_score:
                    continue
                matches.append(
                    PlagiarismMatch(
                        submission_chunk_index=chunk_idx,
                        submission_snippet=submission_snippet,
                        source_article_id=hit.article_id,
                        source_chunk_index=hit.chunk_index,
                        matched_snippet=hit.chunk_text,
                        similarity=hit.similarity,
                    ),
                )

        matches.sort(key=lambda m: m.similarity, reverse=True)
        logger.debug(
            "plagiarism detect: %s submission chunks (batched query) -> %s matches (>=%s)",
            len(chunks),
            len(matches),
            min_score,
        )
        return matches
