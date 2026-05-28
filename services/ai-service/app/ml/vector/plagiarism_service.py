"""Plagiarism detection via batched chunk queries against published articles."""

from __future__ import annotations

import logging
from typing import Any

from app.ml.vector.ai_engine import AIEngine, similarity_from_distance
from app.ml.vector.config import VectorConfig
from app.ml.vector.text_processing import chunk_text, clean_text
from app.ml.vector.types import PlagiarismMatch

logger = logging.getLogger(__name__)


class PlagiarismService:
    """
    Plagiarism Detection: compare submission chunks to published chunks.

    Submission chunks are embedded and queried in **batches** (default 200 embeddings per batch)
    to avoid hitting ChromaDB query size limits for very long documents.
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
        Uses batched embedding queries: embeddings are split into batches
        of size ``batch_size`` (default 200) to avoid DB limits.

        Args:
            submission_text: The text to check for plagiarism.
            threshold: Minimum similarity score (0.85 if None).
            n_results_per_chunk: Number of nearest neighbours to retrieve per chunk.
            batch_size: Maximum number of chunk embeddings per query batch.
            category: If set, only compare against chunks with this category metadata.

        Returns:
            List of PlagiarismMatch objects, sorted by similarity descending.
        """
        min_score = threshold if threshold is not None else self._config.plagiarism_threshold

        cleaned = clean_text(submission_text)
        chunks = chunk_text(cleaned, config=self._config)
        if not chunks:
            return []

        # 1. Embed all chunks at once (this is safe, only the query to DB is batched)
        embeddings = self._engine.embed(chunks)
        collection = self._engine.chunks_collection
        where: dict[str, Any] | None = None
        if category is not None and category.strip():
            where = {"category": {"$eq": category.strip()}}

        # 2. Query Chroma in batches to avoid size limits
        # Prepare accumulators
        all_ids: list[list[str]] = []
        all_distances: list[list[float]] = []
        all_documents: list[list[str]] = []
        all_metadatas: list[list[dict[str, Any]]] = []

        total_batches = (len(embeddings) + batch_size - 1) // batch_size
        for batch_idx in range(0, len(embeddings), batch_size):
            batch_emb = embeddings[batch_idx : batch_idx + batch_size]
            logger.debug(
                "Querying batch %d/%d with %d embeddings",
                batch_idx // batch_size + 1,
                total_batches,
                len(batch_emb),
            )
            query_kwargs: dict[str, Any] = {
                "query_embeddings": batch_emb,
                "n_results": n_results_per_chunk,
                "include": ["metadatas", "documents", "distances"],
            }
            if where is not None:
                query_kwargs["where"] = where
            res = collection.query(**query_kwargs)
            # Extend accumulators (each result is per-chunk list)
            all_ids.extend(res["ids"])
            all_distances.extend(res["distances"])
            all_documents.extend(res["documents"])
            all_metadatas.extend(res["metadatas"])

        # 3. Process batched results exactly as original, but now all_ids etc are flattened lists
        matches: list[PlagiarismMatch] = []
        for chunk_idx, submission_snippet in enumerate(chunks):
            # Each chunk_idx corresponds to one position in the flattened results
            ids_row = all_ids[chunk_idx]
            distances_row = all_distances[chunk_idx]
            docs_row = all_documents[chunk_idx]
            metas_row = all_metadatas[chunk_idx]

            for j, _matched_id in enumerate(ids_row):
                sim = similarity_from_distance(distances_row[j])
                if sim < min_score:
                    continue

                meta = metas_row[j] or {}
                source_article_id = str(meta.get("article_id", ""))
                if not source_article_id:
                    continue

                chunk_index_raw = meta.get("chunk_index", 0)
                try:
                    source_chunk_index = int(chunk_index_raw)
                except (TypeError, ValueError):
                    source_chunk_index = 0

                matches.append(
                    PlagiarismMatch(
                        submission_chunk_index=chunk_idx,
                        submission_snippet=submission_snippet,
                        source_article_id=source_article_id,
                        source_chunk_index=source_chunk_index,
                        matched_snippet=docs_row[j] or "",
                        similarity=sim,
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