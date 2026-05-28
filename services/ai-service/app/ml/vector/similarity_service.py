"""Find similar published articles via the summary collection."""

from __future__ import annotations

import logging

from app.ml.vector.ai_engine import AIEngine, similarity_from_distance
from app.ml.vector.config import VectorConfig
from app.ml.vector.types import ArticleNotIndexedError, SimilarArticleHit

logger = logging.getLogger(__name__)


class SimilarArticlesService:
    """Similar Articles feature: abstract+keywords embedding vs summary collection."""

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
        collection = self._engine.summary_collection

        result = collection.get(
            ids=[article_id],
            include=["embeddings", "metadatas"],
        )
        if not result["ids"]:
            raise ArticleNotIndexedError(f"Article {article_id!r} is not indexed")

        query_emb = result["embeddings"][0]
        source_meta = result["metadatas"][0] or {}
        category = str(source_meta.get("category", ""))
        where = (
            {"category": {"$eq": category}}
            if same_category_only and category
            else None
        )

        n_results = limit + (1 if exclude_self else 0)
        n_results = max(n_results, limit)

        query_res = collection.query(
            query_embeddings=[query_emb],
            n_results=n_results,
            where=where,
            include=["metadatas", "distances"],
        )

        hits: list[SimilarArticleHit] = []
        ids_row = query_res["ids"][0]
        distances_row = query_res["distances"][0]
        metas_row = query_res["metadatas"][0]

        for i, cid in enumerate(ids_row):
            if exclude_self and cid == article_id:
                continue
            if len(hits) >= limit:
                break

            sim = similarity_from_distance(distances_row[i])
            if sim < similarity_threshold:
                continue

            meta = metas_row[i] or {}
            hits.append(
                SimilarArticleHit(
                    article_id=cid,
                    abstract=str(meta.get("abstract", "")),
                    keywords=str(meta.get("keywords", "")),
                    category=str(meta.get("category", "")),
                    similarity=sim,
                ),
            )

        logger.debug("find_similar(%s) -> %s hits", article_id, len(hits))
        return hits
