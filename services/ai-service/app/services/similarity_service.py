from __future__ import annotations

import asyncio
import logging
import threading
from typing import Any

from app.config import Settings
from app.ml.vector.ai_engine import AIEngine
from app.ml.vector.article_ingestion_service import ArticleIngestionService
from app.ml.vector.config import VectorConfig
from app.ml.vector.plagiarism_service import PlagiarismService
from app.ml.vector.search_service import SearchService
from app.ml.vector.similarity_service import SimilarArticlesService
from app.ml.vector.types import ArticleNotIndexedError, VectorDependenciesError

logger = logging.getLogger(__name__)


class SimilarityDisabledError(RuntimeError):
    """Raised when similarity is disabled via configuration."""


class SimilarityUnavailableError(RuntimeError):
    """Raised when similarity ML dependencies are missing."""


def vector_config_from_settings(settings: Settings) -> VectorConfig:
    """Map ai-service Settings to the vector package config."""
    return VectorConfig(
        chroma_path=settings.similarity_chroma_path,
        bi_encoder_model=settings.similarity_model_name,
        device=settings.similarity_device,
        batch_size=settings.similarity_batch_size,
    )


class SimilarityService:
    """HTTP-facing vector API: similar articles, semantic catalog search, ingest."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._ingestion: ArticleIngestionService | None = None
        self._similar: SimilarArticlesService | None = None
        self._search: SearchService | None = None
        self._plagiarism: PlagiarismService | None = None
        self._engine_lock = threading.Lock()

    @property
    def enabled(self) -> bool:
        return self._settings.similarity_enabled

    def _require_enabled(self) -> None:
        if not self.enabled:
            raise SimilarityDisabledError(
                "Article similarity is disabled (SIMILARITY_ENABLED=false)",
            )

    def _get_vector_services(
        self,
    ) -> tuple[ArticleIngestionService, SimilarArticlesService, SearchService]:
        self._require_enabled()
        if (
            self._ingestion is not None
            and self._similar is not None
            and self._search is not None
        ):
            return self._ingestion, self._similar, self._search

        with self._engine_lock:
            if (
                self._ingestion is not None
                and self._similar is not None
                and self._search is not None
            ):
                return self._ingestion, self._similar, self._search
            try:
                config = vector_config_from_settings(self._settings)
                engine = AIEngine.get_instance(config)
                self._ingestion = ArticleIngestionService(
                    engine=engine,
                    config=config,
                )
                self._similar = SimilarArticlesService(
                    engine=engine,
                    config=config,
                )
                self._search = SearchService(engine=engine, config=config)
            except VectorDependenciesError as err:
                raise SimilarityUnavailableError(
                    'Similarity dependencies are not installed. '
                    'Run: pip install -e ".[similarity]"',
                ) from err
            return self._ingestion, self._similar, self._search

    def _get_plagiarism_service(self) -> PlagiarismService:
        self._require_enabled()
        if self._plagiarism is not None:
            return self._plagiarism

        with self._engine_lock:
            if self._plagiarism is not None:
                return self._plagiarism
            try:
                config = vector_config_from_settings(self._settings)
                engine = AIEngine.get_instance(config)
                self._plagiarism = PlagiarismService(engine=engine, config=config)
            except VectorDependenciesError as err:
                raise SimilarityUnavailableError(
                    'Similarity dependencies are not installed. '
                    'Run: pip install -e ".[similarity]"',
                ) from err
            return self._plagiarism

    def status(self) -> dict[str, Any]:
        return {
            "enabled": self.enabled,
            "chroma_path": self._settings.similarity_chroma_path,
            "model_name": self._settings.similarity_model_name,
            "default_threshold": self._settings.similarity_default_threshold,
            "same_category_only": self._settings.similarity_same_category_only,
        }

    async def upsert_article(
        self,
        article_id: str,
        abstract: str,
        keywords: str = "",
        category: str = "",
        *,
        full_text: str = "",
    ) -> None:
        ingestion, _, _ = self._get_vector_services()
        body = full_text.strip() or abstract

        def _run() -> None:
            ingestion.ingest_published_article(
                article_id,
                abstract,
                keywords,
                body,
                category=category,
            )

        await asyncio.to_thread(_run)

    async def remove_article(self, article_id: str) -> None:
        ingestion, _, _ = self._get_vector_services()

        def _run() -> None:
            ingestion.remove_article(article_id)

        await asyncio.to_thread(_run)

    async def find_similar(
        self,
        article_id: str,
        *,
        limit: int | None = None,
        similarity_threshold: float | None = None,
        same_category_only: bool | None = None,
    ) -> list[dict[str, Any]]:
        _, similar, _ = self._get_vector_services()
        lim = limit if limit is not None else self._settings.similarity_default_limit
        threshold = (
            similarity_threshold
            if similarity_threshold is not None
            else self._settings.similarity_default_threshold
        )
        same_cat = (
            same_category_only
            if same_category_only is not None
            else self._settings.similarity_same_category_only
        )

        def _run() -> list[dict[str, Any]]:
            try:
                hits = similar.find_similar(
                    article_id,
                    limit=lim,
                    similarity_threshold=threshold,
                    same_category_only=same_cat,
                )
            except ArticleNotIndexedError:
                return []
            return [
                {
                    "article_id": h.article_id,
                    "abstract": h.abstract,
                    "keywords": h.keywords,
                    "category": h.category,
                    "similarity": h.similarity,
                }
                for h in hits
            ]

        return await asyncio.to_thread(_run)

    async def semantic_search(
        self,
        query: str,
        *,
        limit: int | None = None,
    ) -> list[dict[str, Any]]:
        _, _, search = self._get_vector_services()
        lim = (
            limit
            if limit is not None
            else self._settings.similarity_search_default_limit
        )

        def _run() -> list[dict[str, Any]]:
            hits = search.search(query, limit_articles=lim)
            return [
                {
                    "article_id": h.article_id,
                    "snippet": h.snippet,
                    "score": h.score,
                }
                for h in hits
            ]

        return await asyncio.to_thread(_run)

    async def detect_corpus_similarity(
        self,
        submission_text: str,
        *,
        threshold: float | None = None,
        category: str | None = None,
    ) -> list[dict[str, Any]]:
        if not submission_text or not submission_text.strip():
            raise ValueError("submission_text must not be empty")

        plagiarism = self._get_plagiarism_service()
        min_score = (
            threshold
            if threshold is not None
            else self._settings.similarity_default_threshold
        )

        def _run() -> list[dict[str, Any]]:
            matches = plagiarism.detect(
                submission_text,
                threshold=min_score,
                category=category,
            )
            return [
                {
                    "submission_chunk_index": m.submission_chunk_index,
                    "submission_snippet": m.submission_snippet,
                    "source_article_id": m.source_article_id,
                    "source_chunk_index": m.source_chunk_index,
                    "matched_snippet": m.matched_snippet,
                    "similarity": m.similarity,
                }
                for m in matches
            ]

        return await asyncio.to_thread(_run)
