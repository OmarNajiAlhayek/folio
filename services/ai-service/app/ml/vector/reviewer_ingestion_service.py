"""Ingest reviewer bios and per-submission review history into Chroma."""

from __future__ import annotations

import logging

from app.ml.vector.ai_engine import AIEngine
from app.ml.vector.article_ingestion_service import ArticleIngestionService
from app.ml.vector.config import VectorConfig
from app.ml.vector.text_processing import clean_text, reviewer_history_id

logger = logging.getLogger(__name__)


class ReviewerIngestionService:
    """Add or remove reviewer profile and review-history rows from vector collections."""

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

        cleaned_bio = clean_text(bio_text)
        collection = self._engine.reviewers_collection
        existing = collection.get(ids=[reviewer_id])
        if existing["ids"]:
            collection.delete(ids=[reviewer_id])

        if not cleaned_bio:
            logger.debug("Skipped empty bio for reviewer %s", reviewer_id)
            return

        embedding = self._engine.embed([cleaned_bio])[0]
        metadata: dict[str, str] = {}
        name = display_name.strip()
        if name:
            metadata["display_name"] = name

        collection.add(
            ids=[reviewer_id],
            embeddings=[embedding],
            documents=[cleaned_bio],
            metadatas=[metadata],
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
        """Index submission abstract+keywords in the shared summary collection."""
        _ = reviewer_id  # reviewer→submission mapping comes from the suggest request
        self._articles.upsert_submission_summary(
            submission_id,
            abstract,
            keywords,
            category=category,
        )

    def remove_reviewer(self, reviewer_id: str) -> None:
        """Delete reviewer bio and legacy per-reviewer history rows."""
        reviewer_id = reviewer_id.strip()
        if not reviewer_id:
            raise ValueError("reviewer_id is required")

        self._engine.reviewers_collection.delete(ids=[reviewer_id])
        self._engine.reviewer_history_collection.delete(
            where={"reviewer_id": {"$eq": reviewer_id}},
        )
        logger.info("Removed reviewer %s from vector index", reviewer_id)

    def remove_review_history(self, reviewer_id: str, submission_id: str) -> None:
        """
        Drop legacy reviewer-history row if present.

        Does not remove the shared submission summary (may still be published).
        """
        reviewer_id = reviewer_id.strip()
        submission_id = submission_id.strip()
        if not reviewer_id:
            raise ValueError("reviewer_id is required")
        if not submission_id:
            raise ValueError("submission_id is required")

        row_id = reviewer_history_id(reviewer_id, submission_id)
        existing = self._engine.reviewer_history_collection.get(ids=[row_id])
        if existing["ids"]:
            self._engine.reviewer_history_collection.delete(ids=[row_id])
            logger.info("Removed legacy review history %s", row_id)
