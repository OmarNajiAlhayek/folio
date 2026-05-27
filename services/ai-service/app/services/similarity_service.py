from __future__ import annotations

import asyncio
import logging
import threading
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from app.config import Settings

if TYPE_CHECKING:
    from sentence_transformers import SentenceTransformer

logger = logging.getLogger(__name__)


class SimilarityDisabledError(RuntimeError):
    """Raised when similarity is disabled via configuration."""


class SimilarityUnavailableError(RuntimeError):
    """Raised when similarity ML dependencies are missing."""


@dataclass(frozen=True)
class SimilarArticleHit:
    article_id: str
    abstract: str
    keywords: str
    category: str
    similarity: float


def _combine_text(abstract: str, keywords: str) -> str:
    abstract = abstract.strip()
    keywords = keywords.strip()
    if keywords:
        return f"{abstract} [KEYWORDS] {keywords}".strip()
    return abstract


class _SimilarityEngine:
    """Chroma + bi-encoder index (internal)."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._client: Any = None
        self._collection: Any = None
        self._bi_encoder: SentenceTransformer | None = None
        self._init_lock = threading.Lock()

    def _require_deps(self) -> None:
        try:
            import chromadb  # noqa: F401
            from sentence_transformers import SentenceTransformer  # noqa: F401
        except ImportError as err:
            raise SimilarityUnavailableError(
                'Similarity dependencies are not installed. Run: pip install -e ".[similarity]"',
            ) from err

    def _init_client(self) -> None:
        if self._collection is not None:
            return
        import chromadb

        path = self._settings.similarity_chroma_path
        self._client = chromadb.PersistentClient(path=path)
        self._collection = self._client.get_or_create_collection(
            name=self._settings.similarity_collection_name,
            metadata={"hnsw:space": "cosine"},
        )
        logger.info(
            "Similarity Chroma collection %r ready (count=%s)",
            self._settings.similarity_collection_name,
            self._collection.count(),
        )

    def _init_bi_encoder(self) -> None:
        if self._bi_encoder is not None:
            return
        from sentence_transformers import SentenceTransformer

        model_name = self._settings.similarity_model_name
        device = self._settings.similarity_device
        logger.info("Loading similarity bi-encoder %s on %s", model_name, device)
        self._bi_encoder = SentenceTransformer(model_name, device=device)

    def _ensure_ready(self) -> None:
        self._require_deps()
        with self._init_lock:
            self._init_client()
            self._init_bi_encoder()

    def _embed(self, texts: list[str]) -> list[list[float]]:
        assert self._bi_encoder is not None
        return (
            self._bi_encoder.encode(
                texts,
                batch_size=self._settings.similarity_batch_size,
                convert_to_tensor=False,
                show_progress_bar=False,
            ).tolist()
        )

    def upsert_article(
        self,
        article_id: str,
        abstract: str,
        keywords: str = "",
        category: str = "",
    ) -> None:
        self._ensure_ready()
        assert self._collection is not None

        combined = _combine_text(abstract, keywords)
        if not combined:
            raise ValueError("abstract or keywords required to index an article")

        existing = self._collection.get(ids=[article_id], include=["metadatas"])
        if existing["ids"]:
            self._collection.delete(ids=[article_id])

        meta = {
            "category": category,
            "abstract": abstract.strip(),
            "keywords": keywords.strip(),
        }
        embeddings = self._embed([combined])
        self._collection.add(
            ids=[article_id],
            embeddings=embeddings,
            metadatas=[meta],
            documents=[combined],
        )

    def remove_article(self, article_id: str) -> None:
        self._ensure_ready()
        assert self._collection is not None
        self._collection.delete(ids=[article_id])

    def find_similar(
        self,
        article_id: str,
        *,
        limit: int,
        similarity_threshold: float,
        same_category_only: bool,
    ) -> list[SimilarArticleHit]:
        self._ensure_ready()
        assert self._collection is not None

        result = self._collection.get(
            ids=[article_id],
            include=["embeddings", "metadatas"],
        )
        if not result["ids"]:
            return []

        query_emb = result["embeddings"][0]
        category = (result["metadatas"][0] or {}).get("category", "")
        where = {"category": {"$eq": category}} if same_category_only and category else None

        n_results = max(limit + 1, limit)
        query_res = self._collection.query(
            query_embeddings=[query_emb],
            n_results=n_results,
            where=where,
            include=["metadatas", "distances"],
        )

        output: list[SimilarArticleHit] = []
        ids_row = query_res["ids"][0]
        for i, cid in enumerate(ids_row):
            if cid == article_id:
                continue
            if len(output) >= limit:
                break
            distance = query_res["distances"][0][i]
            sim = max(0.0, min(1.0, 1.0 - distance))
            if sim < similarity_threshold:
                continue
            meta = query_res["metadatas"][0][i] or {}
            output.append(
                SimilarArticleHit(
                    article_id=cid,
                    abstract=str(meta.get("abstract", "")),
                    keywords=str(meta.get("keywords", "")),
                    category=str(meta.get("category", "")),
                    similarity=sim,
                ),
            )
        return output


class SimilarityService:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._engine: _SimilarityEngine | None = None
        self._engine_lock = threading.Lock()

    @property
    def enabled(self) -> bool:
        return self._settings.similarity_enabled

    def _require_enabled(self) -> None:
        if not self.enabled:
            raise SimilarityDisabledError(
                "Article similarity is disabled (SIMILARITY_ENABLED=false)",
            )

    def _get_engine(self) -> _SimilarityEngine:
        self._require_enabled()
        if self._engine is not None:
            return self._engine
        with self._engine_lock:
            if self._engine is None:
                self._engine = _SimilarityEngine(self._settings)
            return self._engine

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
    ) -> None:
        engine = self._get_engine()

        def _run() -> None:
            engine.upsert_article(article_id, abstract, keywords, category)

        await asyncio.to_thread(_run)

    async def remove_article(self, article_id: str) -> None:
        engine = self._get_engine()

        def _run() -> None:
            engine.remove_article(article_id)

        await asyncio.to_thread(_run)

    async def find_similar(
        self,
        article_id: str,
        *,
        limit: int | None = None,
        similarity_threshold: float | None = None,
        same_category_only: bool | None = None,
    ) -> list[dict[str, Any]]:
        engine = self._get_engine()
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

        def _run() -> list[SimilarArticleHit]:
            return engine.find_similar(
                article_id,
                limit=lim,
                similarity_threshold=threshold,
                same_category_only=same_cat,
            )

        hits = await asyncio.to_thread(_run)
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
