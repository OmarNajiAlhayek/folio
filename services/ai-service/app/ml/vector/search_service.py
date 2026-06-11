"""Semantic search over full-text chunks."""

from __future__ import annotations

import logging

from app.ml.vector.ai_engine import AIEngine
from app.ml.vector.config import VectorConfig
from app.ml.vector.text_processing import clean_text
from app.ml.vector.types import SearchHit

logger = logging.getLogger(__name__)


class SearchService:
    """Semantic Search: user query against the chunks table."""

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

        batch = self._engine.store.query_similar_chunks(
            [query_embedding],
            limit_per_query=n_results,
        )
        chunk_hits = batch[0] if batch else []

        best_by_article: dict[str, SearchHit] = {}
        for hit in chunk_hits:
            existing = best_by_article.get(hit.article_id)
            if existing is None or hit.similarity > existing.score:
                best_by_article[hit.article_id] = SearchHit(
                    article_id=hit.article_id,
                    snippet=hit.chunk_text,
                    score=hit.similarity,
                )

        ranked = sorted(best_by_article.values(), key=lambda h: h.score, reverse=True)
        return ranked[:limit_articles]
