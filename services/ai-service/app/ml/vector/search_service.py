"""Semantic search over full-text chunks."""

from __future__ import annotations

import logging

from app.ml.vector.ai_engine import AIEngine, similarity_from_distance
from app.ml.vector.config import VectorConfig
from app.ml.vector.text_processing import clean_text
from app.ml.vector.types import SearchHit

logger = logging.getLogger(__name__)


class SearchService:
    """Semantic Search: user query against the chunks collection."""

    def __init__(
        self,
        engine: AIEngine | None = None,
        config: VectorConfig | None = None,
    ) -> None:
        self._config = config or VectorConfig()
        self._engine = engine or AIEngine.get_instance(self._config)

    def search(
        self,
        query: str,
        *,
        limit_articles: int = 10,
    ) -> list[SearchHit]:
        """
        Search published article chunks; return unique articles with best snippet.

        ``limit_articles`` caps the number of distinct ``article_id`` values returned.
        """
        cleaned = clean_text(query)
        if not cleaned:
            return []

        query_embedding = self._engine.embed([cleaned])[0]
        n_results = max(
            limit_articles * self._config.search_n_results_per_chunk,
            limit_articles,
        )

        collection = self._engine.chunks_collection
        query_res = collection.query(
            query_embeddings=[query_embedding],
            n_results=n_results,
            include=["metadatas", "documents", "distances"],
        )

        best_by_article: dict[str, SearchHit] = {}
        ids_row = query_res["ids"][0]
        distances_row = query_res["distances"][0]
        docs_row = query_res["documents"][0]
        metas_row = query_res["metadatas"][0]

        for i, _chunk_doc_id in enumerate(ids_row):
            meta = metas_row[i] or {}
            aid = str(meta.get("article_id", ""))
            if not aid:
                continue

            score = similarity_from_distance(distances_row[i])
            snippet = docs_row[i] or ""

            existing = best_by_article.get(aid)
            if existing is None or score > existing.score:
                best_by_article[aid] = SearchHit(
                    article_id=aid,
                    snippet=snippet,
                    score=score,
                )

        ranked = sorted(best_by_article.values(), key=lambda h: h.score, reverse=True)
        return ranked[:limit_articles]
