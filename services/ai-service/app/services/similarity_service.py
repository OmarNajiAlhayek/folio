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





class WebSimilarityUnavailableError(RuntimeError):

    """Raised when web similarity dependencies or credentials are missing."""





def vector_config_from_settings(settings: Settings) -> VectorConfig:

    """Map ai-service Settings to the vector package config."""

    return VectorConfig(

        vector_db_host=settings.vector_db_host,

        vector_db_port=settings.vector_db_port,

        vector_db_user=settings.vector_db_user,

        vector_db_password=settings.vector_db_password,

        vector_db_database=settings.vector_db_database,

        vector_db_ssl=settings.vector_db_ssl,

        vector_db_hnsw_ef_search=settings.vector_db_hnsw_ef_search,

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

        self._web_plagiarism: Any | None = None

        self._engine_lock = threading.Lock()



    @property

    def enabled(self) -> bool:

        return self._settings.similarity_enabled



    @property

    def corpus_similarity_enabled(self) -> bool:

        return self._settings.similarity_enabled or self._web_similarity_configured()



    def _web_similarity_configured(self) -> bool:

        if not self._settings.web_similarity_enabled:

            return False

        return bool(

            self._settings.google_cse_api_key.strip()

            and self._settings.google_cse_id.strip()

        )



    def _require_enabled(self) -> None:

        if not self.enabled:

            raise SimilarityDisabledError(

                "Article similarity is disabled (SIMILARITY_ENABLED=false)",

            )



    def _require_corpus_enabled(self) -> None:

        if not self.corpus_similarity_enabled:

            raise SimilarityDisabledError(

                "Corpus similarity is disabled "

                "(SIMILARITY_ENABLED=false and WEB_SIMILARITY_ENABLED=false or missing keys)",

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



    def _get_web_plagiarism_service(self) -> Any:

        if not self._web_similarity_configured():

            raise WebSimilarityUnavailableError(

                "Web similarity is disabled or missing GOOGLE_CSE_API_KEY / GOOGLE_CSE_ID",

            )

        if self._web_plagiarism is not None:

            return self._web_plagiarism



        with self._engine_lock:

            if self._web_plagiarism is not None:

                return self._web_plagiarism

            try:

                from app.ml.web_similarity.web_plagiarism_service import (

                    WebPlagiarismService,

                )

            except ImportError as err:

                raise WebSimilarityUnavailableError(

                    'Web similarity dependencies are not installed. '

                    'Run: pip install -e ".[ml,web_similarity]"',

                ) from err

            self._web_plagiarism = WebPlagiarismService(

                api_key=self._settings.google_cse_api_key.strip(),

                cse_id=self._settings.google_cse_id.strip(),

                max_queries=self._settings.web_similarity_max_queries,

                results_per_query=self._settings.web_similarity_results_per_query,

                threshold=self._settings.web_similarity_threshold,

                search_lang=self._settings.web_similarity_search_lang,

                fetch_workers=self._settings.web_similarity_fetch_workers,

            )

            return self._web_plagiarism



    def status(self) -> dict[str, Any]:

        return {

            "enabled": self.corpus_similarity_enabled,

            "local_enabled": self._settings.similarity_enabled,

            "web_enabled": self._web_similarity_configured(),

            "vector_backend": "pgvector",

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

    ) -> dict[str, Any]:

        if not submission_text or not submission_text.strip():

            raise ValueError("submission_text must not be empty")



        self._require_corpus_enabled()



        local_matches: list[dict[str, Any]] = []

        web_matches: list[dict[str, Any]] = []

        local_error: str | None = None

        web_error: str | None = None



        if self._settings.similarity_enabled:

            min_score = (

                threshold

                if threshold is not None

                else self._settings.similarity_default_threshold

            )



            def _run_local() -> list[dict[str, Any]]:

                plagiarism = self._get_plagiarism_service()

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



            try:

                local_matches = await asyncio.to_thread(_run_local)

            except Exception as exc:

                logger.exception("Local corpus similarity failed")

                local_error = str(exc)



        if self._web_similarity_configured():

            def _run_web() -> list[dict[str, Any]]:

                web_service = self._get_web_plagiarism_service()

                matches = web_service.detect(submission_text)

                return [

                    {

                        "query_snippet": m.query_snippet,

                        "source_url": m.source_url,

                        "matched_snippet": m.matched_snippet,

                        "similarity": m.similarity,

                    }

                    for m in matches

                ]



            try:

                web_matches = await asyncio.to_thread(_run_web)

            except Exception as exc:

                logger.exception("Web similarity failed")

                web_error = str(exc)



        return {

            "local_matches": local_matches,

            "web_matches": web_matches,

            "local_error": local_error,

            "web_error": web_error,

        }


