"""Ingest reviewer bios into pgvector."""

from __future__ import annotations

import logging

from app.ml.vector.ai_engine import AIEngine
from app.ml.vector.article_ingestion_service import ArticleIngestionService
from app.ml.vector.config import VectorConfig
from app.ml.vector.text_processing import clean_text
from app.ml.vector.vector_store import ReviewerBioRow

logger = logging.getLogger(__name__)


class ReviewerIngestionService:
    """Add or remove reviewer profile rows from the vector tables."""

    def __init__(
        self,
        engine: AIEngine | None = None,
        config: VectorConfig | None = None,
        *,
        article_ingestion: ArticleIngestionService | None = None,
    ) -> None:
        self._config = config or VectorConfig()
        self._engine = engine or AIEngine.get_instance(self._config)
        self._articles = article_ingestion or ArticleIngestionService(
            engine=self._engine,
            config=self._config,
        )

    def upsert_reviewer(
        self,
        reviewer_id: str,
        bio_text: str,
        *,
        display_name: str = "",
    ) -> None:
        """
        Index reviewer bio text.

        Empty bio after cleaning removes any existing bio row (history-only reviewers).
        """
        reviewer_id = reviewer_id.strip()
        if not reviewer_id:
            raise ValueError("reviewer_id is required")

        store = self._engine.store
        cleaned_bio = clean_text(bio_text)
        if not cleaned_bio:
            store.delete_reviewer_bio(reviewer_id)
            logger.debug("Skipped empty bio for reviewer %s", reviewer_id)
            return

        embedding = self._engine.embed([cleaned_bio])[0]
        name = display_name.strip() or None
        store.upsert_reviewer_bio(
            ReviewerBioRow(
                reviewer_id=reviewer_id,
                embedding=embedding,
                bio_text=cleaned_bio,
                display_name=name,
            ),
        )
        logger.info("Upserted reviewer bio %s", reviewer_id)

    def upsert_review_history(
        self,
        reviewer_id: str,
        submission_id: str,
        abstract: str,
        keywords: str,
        *,
        category: str = "",
    ) -> None:
        """Index submission abstract+keywords in the shared summary table."""
        _ = reviewer_id  # reviewer→submission mapping comes from the suggest request
        self._articles.upsert_submission_summary(
            submission_id,
            abstract,
            keywords,
            category=category,
        )

    def remove_reviewer(self, reviewer_id: str) -> None:
        """Delete reviewer bio row."""
        reviewer_id = reviewer_id.strip()
        if not reviewer_id:
            raise ValueError("reviewer_id is required")

        self._engine.store.delete_reviewer_bio(reviewer_id)
        logger.info("Removed reviewer %s from vector index", reviewer_id)

    def remove_review_history(self, reviewer_id: str, submission_id: str) -> None:
        """
        No-op for shared submission summaries.

        Does not remove the shared submission summary (may still be published).
        """
        _ = reviewer_id
        _ = submission_id
