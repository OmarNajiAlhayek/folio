"""Ingest published articles into summary and chunk pgvector tables."""

from __future__ import annotations

import logging

from app.ml.vector.ai_engine import AIEngine
from app.ml.vector.config import VectorConfig
from app.ml.vector.text_processing import chunk_text, clean_text, combine_summary_text
from app.ml.vector.types import IngestResult
from app.ml.vector.vector_store import ChunkRow, SummaryRow

logger = logging.getLogger(__name__)


class ArticleIngestionService:
    """Add or remove published articles from both vector tables."""

    def __init__(
        self,
        engine: AIEngine | None = None,
        config: VectorConfig | None = None,
    ) -> None:
        self._config = config or VectorConfig()
        self._engine = engine or AIEngine.get_instance(self._config)

    def ingest_published_article(
        self,
        article_id: str,
        abstract: str,
        keywords: str,
        full_text: str,
        *,
        category: str = "",
    ) -> IngestResult:
        """
        Index abstract+keywords in the summary table and full text as chunks.

        Existing rows for ``article_id`` are replaced atomically per table.
        """
        article_id = article_id.strip()
        if not article_id:
            raise ValueError("article_id is required")

        self.upsert_submission_summary(
            article_id,
            abstract,
            keywords,
            category=category,
        )

        cleaned_full = clean_text(full_text)
        chunks = chunk_text(cleaned_full, config=self._config)
        self._replace_chunks(
            article_id=article_id,
            chunks=chunks,
            category=category.strip(),
        )

        logger.info(
            "Ingested article %s: 1 summary, %s chunks",
            article_id,
            len(chunks),
        )
        return IngestResult(
            article_id=article_id,
            summary_indexed=1,
            chunks_indexed=len(chunks),
        )

    def upsert_submission_summary(
        self,
        submission_id: str,
        abstract: str,
        keywords: str = "",
        *,
        category: str = "",
    ) -> None:
        """
        Index abstract+keywords in the shared summary table (submission id).

        Used for published articles and reviewer-match history without duplicating
        embeddings in a separate table.
        """
        submission_id = submission_id.strip()
        if not submission_id:
            raise ValueError("submission_id is required")

        cleaned_abstract = clean_text(abstract)
        cleaned_keywords = clean_text(keywords)
        summary_text = combine_summary_text(cleaned_abstract, cleaned_keywords)
        if not summary_text:
            raise ValueError("abstract or keywords required to index summary")

        store = self._engine.store
        existing = store.get_summary(submission_id)
        if existing is not None and existing.summary_text == summary_text:
            logger.debug("Summary unchanged for %s; skip re-embed", submission_id)
            return

        self._upsert_summary(
            article_id=submission_id,
            summary_text=summary_text,
            abstract=abstract.strip(),
            keywords=keywords.strip(),
            category=category.strip(),
        )
        logger.info("Upserted submission summary %s", submission_id)

    def remove_article(self, article_id: str) -> None:
        """Delete an article from both vector tables."""
        article_id = article_id.strip()
        if not article_id:
            raise ValueError("article_id is required")

        store = self._engine.store
        store.delete_summary(article_id)
        store.delete_chunks(article_id)
        logger.info("Removed article %s from vector index", article_id)

    def _upsert_summary(
        self,
        *,
        article_id: str,
        summary_text: str,
        abstract: str,
        keywords: str,
        category: str,
    ) -> None:
        embedding = self._engine.embed([summary_text])[0]
        self._engine.store.upsert_summary(
            SummaryRow(
                submission_id=article_id,
                embedding=embedding,
                summary_text=summary_text,
                abstract=abstract,
                keywords=keywords,
                category=category,
            ),
        )

    def _replace_chunks(
        self,
        *,
        article_id: str,
        chunks: list[str],
        category: str = "",
    ) -> None:
        if not chunks:
            self._engine.store.replace_chunks(article_id, [])
            return

        embeddings = self._engine.embed(chunks)
        rows = [
            ChunkRow(
                article_id=article_id,
                chunk_index=i,
                embedding=embeddings[i],
                chunk_text=chunks[i],
                category=category,
            )
            for i in range(len(chunks))
        ]
        self._engine.store.replace_chunks(article_id, rows)
