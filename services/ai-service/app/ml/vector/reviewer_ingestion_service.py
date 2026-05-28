"""Ingest reviewer bios and per-submission review history into Chroma."""

from __future__ import annotations

import logging

from app.ml.vector.ai_engine import AIEngine
from app.ml.vector.config import VectorConfig
from app.ml.vector.text_processing import (
    clean_text,
    combine_summary_text,
    reviewer_history_id,
)

logger = logging.getLogger(__name__)


class ReviewerIngestionService:
    """Add or remove reviewer profile and review-history rows from vector collections."""

    def __init__(
        self,
        engine: AIEngine | None = None,
        config: VectorConfig | None = None,
    ) -> None:
        self._config = config or VectorConfig()
        self._engine = engine or AIEngine.get_instance(self._config)

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
    ) -> None:
        """Index one completed review as abstract+keywords summary."""
        reviewer_id = reviewer_id.strip()
        submission_id = submission_id.strip()
        if not reviewer_id:
            raise ValueError("reviewer_id is required")
        if not submission_id:
            raise ValueError("submission_id is required")

        cleaned_abstract = clean_text(abstract)
        cleaned_keywords = clean_text(keywords)
        document = combine_summary_text(cleaned_abstract, cleaned_keywords)
        if not document:
            raise ValueError("abstract or keywords required to index review history")

        row_id = reviewer_history_id(reviewer_id, submission_id)
        collection = self._engine.reviewer_history_collection
        existing = collection.get(ids=[row_id])
        if existing["ids"]:
            collection.delete(ids=[row_id])

        embedding = self._engine.embed([document])[0]
        metadata = {
            "reviewer_id": reviewer_id,
            "submission_id": submission_id,
            "abstract": abstract.strip(),
            "keywords": keywords.strip(),
        }
        collection.add(
            ids=[row_id],
            embeddings=[embedding],
            documents=[document],
            metadatas=[metadata],
        )
        logger.info("Upserted review history %s", row_id)

    def remove_reviewer(self, reviewer_id: str) -> None:
        """Delete reviewer bio and all history rows."""
        reviewer_id = reviewer_id.strip()
        if not reviewer_id:
            raise ValueError("reviewer_id is required")

        self._engine.reviewers_collection.delete(ids=[reviewer_id])
        self._engine.reviewer_history_collection.delete(
            where={"reviewer_id": {"$eq": reviewer_id}},
        )
        logger.info("Removed reviewer %s from vector index", reviewer_id)

    def remove_review_history(self, reviewer_id: str, submission_id: str) -> None:
        """Delete one review history row."""
        reviewer_id = reviewer_id.strip()
        submission_id = submission_id.strip()
        if not reviewer_id:
            raise ValueError("reviewer_id is required")
        if not submission_id:
            raise ValueError("submission_id is required")

        row_id = reviewer_history_id(reviewer_id, submission_id)
        self._engine.reviewer_history_collection.delete(ids=[row_id])
        logger.info("Removed review history %s", row_id)
