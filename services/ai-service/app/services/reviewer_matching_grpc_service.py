"""HTTP/gRPC-facing reviewer matching (vector index + suggest)."""

from __future__ import annotations

import asyncio
import logging
import threading
from typing import Any

from app.config import Settings
from app.ml.vector.ai_engine import AIEngine
from app.ml.vector.config import VectorConfig
from app.ml.vector.reviewer_ingestion_service import ReviewerIngestionService
from app.ml.vector.reviewer_matching_service import ReviewerMatchingService
from app.ml.vector.text_processing import clean_text, combine_summary_text
from app.ml.vector.types import ReviewerSuggestionHit, VectorDependenciesError
from app.services.similarity_service import vector_config_from_settings

logger = logging.getLogger(__name__)


class ReviewerMatchingDisabledError(RuntimeError):
    """Raised when reviewer matching is disabled via configuration."""


class ReviewerMatchingUnavailableError(RuntimeError):
    """Raised when reviewer matching ML dependencies are missing."""


class ReviewerMatchingGrpcService:
    """Sync reviewer profiles/history and run two-stage reviewer suggestion."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._ingestion: ReviewerIngestionService | None = None
        self._matching: ReviewerMatchingService | None = None
        self._lock = threading.Lock()

    @property
    def enabled(self) -> bool:
        return self._settings.reviewer_matching_enabled

    def status(self) -> dict[str, Any]:
        return {
            "enabled": self.enabled,
            "chroma_path": self._settings.similarity_chroma_path,
            "model_name": self._settings.similarity_model_name,
        }

    def _require_enabled(self) -> None:
        if not self.enabled:
            raise ReviewerMatchingDisabledError(
                "Reviewer matching is disabled (REVIEWER_MATCHING_ENABLED=false)",
            )

    def _get_services(
        self,
    ) -> tuple[ReviewerIngestionService, ReviewerMatchingService]:
        self._require_enabled()
        if self._ingestion is not None and self._matching is not None:
            return self._ingestion, self._matching

        with self._lock:
            if self._ingestion is not None and self._matching is not None:
                return self._ingestion, self._matching
            try:
                config = vector_config_from_settings(self._settings)
                engine = AIEngine.get_instance(config)
                self._ingestion = ReviewerIngestionService(engine=engine, config=config)
                self._matching = ReviewerMatchingService(engine=engine, config=config)
            except VectorDependenciesError as err:
                raise ReviewerMatchingUnavailableError(
                    'Reviewer matching dependencies are not installed. '
                    'Run: pip install -e ".[similarity]"',
                ) from err
            return self._ingestion, self._matching

    async def suggest_reviewers(
        self,
        *,
        query_text: str,
        limit: int | None = None,
        candidate_ids: list[str] | None = None,
        exclude_reviewer_ids: list[str] | None = None,
        index_profiles: list[dict[str, str]] | None = None,
        index_history: list[dict[str, str]] | None = None,
        use_cross_encoder: bool = True,
    ) -> list[dict[str, Any]]:
        ingestion, matching = self._get_services()

        def _run() -> list[ReviewerSuggestionHit]:
            for profile in index_profiles or []:
                reviewer_id = (profile.get("reviewer_id") or "").strip()
                if not reviewer_id:
                    continue
                affiliation = profile.get("affiliation") or ""
                keywords = profile.get("review_keywords") or ""
                bio = combine_summary_text(
                    clean_text(affiliation),
                    clean_text(keywords),
                )
                ingestion.upsert_reviewer(
                    reviewer_id,
                    bio,
                    display_name=(profile.get("display_name") or "").strip(),
                )

            for row in index_history or []:
                reviewer_id = (row.get("reviewer_id") or "").strip()
                submission_id = (row.get("submission_id") or "").strip()
                if not reviewer_id or not submission_id:
                    continue
                try:
                    ingestion.upsert_review_history(
                        reviewer_id,
                        submission_id,
                        row.get("abstract") or "",
                        row.get("keywords") or "",
                    )
                except ValueError:
                    logger.debug(
                        "Skipping empty history row %s::%s",
                        reviewer_id,
                        submission_id,
                    )

            hits = matching.suggest_reviewers(
                query_text,
                limit=limit,
                candidate_ids=candidate_ids,
                exclude_reviewer_ids=exclude_reviewer_ids,
                use_cross_encoder=use_cross_encoder,
            )
            return hits

        result = await asyncio.to_thread(_run)
        return [
            {
                "reviewer_id": h.reviewer_id,
                "final_score": h.final_score,
                "bio_score": h.bio_score,
                "history_score": h.history_score,
                "ce_bio_score": h.ce_bio_score,
                "ce_history_score": h.ce_history_score,
                "used_cross_encoder": h.used_cross_encoder,
            }
            for h in result
        ]
