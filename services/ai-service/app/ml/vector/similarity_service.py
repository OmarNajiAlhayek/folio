"""Find similar published articles via the summary embeddings table."""

from __future__ import annotations

import logging

from app.ml.vector.ai_engine import AIEngine
from app.ml.vector.config import VectorConfig
from app.ml.vector.types import ArticleNotIndexedError, SimilarArticleHit

logger = logging.getLogger(__name__)


class SimilarArticlesService:
    """Similar Articles feature: abstract+keywords embedding vs summary table."""

    def __init__(
        self,
        engine: AIEngine | None = None,
        config: VectorConfig | None = None,
    ) -> None:
        self._config = config or VectorConfig()
        self._engine = engine or AIEngine.get_instance(self._config)

    def find_similar(
        self,
        article_id: str,
        *,
        limit: int = 10,
        similarity_threshold: float = 0.7,
        exclude_self: bool = True,
        same_category_only: bool = False,
    ) -> list[SimilarArticleHit]:
        """
        Return published articles most similar to the target's abstract+keywords.

        Uses the stored summary embedding for ``article_id``.
        """
        article_id = article_id.strip()
        store = self._engine.store

        source = store.get_summary(article_id)
        if source is None:
            raise ArticleNotIndexedError(f"Article {article_id!r} is not indexed")

        category = source.category if same_category_only and source.category else None
        n_results = limit + (1 if exclude_self else 0)
        n_results = max(n_results, limit)

        hits_raw = store.query_similar_summaries(
            source.embedding,
            limit=n_results,
            category=category,
            exclude_submission_id=article_id if exclude_self else None,
        )

        hits: list[SimilarArticleHit] = []
        for row in hits_raw:
            if exclude_self and row.submission_id == article_id:
                continue
            if len(hits) >= limit:
                break
            if row.similarity < similarity_threshold:
                continue
            hits.append(
                SimilarArticleHit(
                    article_id=row.submission_id,
                    abstract=row.abstract,
                    keywords=row.keywords,
                    category=row.category,
                    similarity=row.similarity,
                ),
            )

        logger.debug("find_similar(%s) -> %s hits", article_id, len(hits))
        return hits
