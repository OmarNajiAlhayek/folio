"""Ingest published articles into summary and chunk Chroma collections."""

from __future__ import annotations

import logging

from app.ml.vector.ai_engine import AIEngine
from app.ml.vector.config import VectorConfig
from app.ml.vector.text_processing import (
    chunk_id,
    chunk_text,
    clean_text,
    combine_summary_text,
)
from app.ml.vector.types import IngestResult

logger = logging.getLogger(__name__)


class ArticleIngestionService:
    """Add or remove published articles from both vector collections."""

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
        Index abstract+keywords in the summary collection and full text as chunks.

        Existing rows for ``article_id`` are replaced atomically per collection.
        """
        article_id = article_id.strip()
        if not article_id:
            raise ValueError("article_id is required")

        cleaned_abstract = clean_text(abstract)
        cleaned_keywords = clean_text(keywords)
        summary_text = combine_summary_text(cleaned_abstract, cleaned_keywords)
        if not summary_text:
            raise ValueError("abstract or keywords required to index summary")

        self._upsert_summary(
            article_id=article_id,
            summary_text=summary_text,
            abstract=abstract.strip(),
            keywords=keywords.strip(),
            category=category.strip(),
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

    def remove_article(self, article_id: str) -> None:
        """Delete an article from both collections."""
        article_id = article_id.strip()
        if not article_id:
            raise ValueError("article_id is required")

        summary = self._engine.summary_collection
        chunks = self._engine.chunks_collection

        summary.delete(ids=[article_id])
        chunks.delete(where={"article_id": {"$eq": article_id}})
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
        collection = self._engine.summary_collection
        existing = collection.get(ids=[article_id])
        if existing["ids"]:
            collection.delete(ids=[article_id])

        embedding = self._engine.embed([summary_text])[0]
        metadata = {
            "article_id": article_id,
            "abstract": abstract,
            "keywords": keywords,
            "category": category,
        }
        collection.add(
            ids=[article_id],
            embeddings=[embedding],
            documents=[summary_text],
            metadatas=[metadata],
        )

    def _replace_chunks(
        self,
        *,
        article_id: str,
        chunks: list[str],
        category: str = "",
    ) -> None:
        collection = self._engine.chunks_collection
        collection.delete(where={"article_id": {"$eq": article_id}})

        if not chunks:
            return

        ids = [chunk_id(article_id, i) for i in range(len(chunks))]
        embeddings = self._engine.embed(chunks)
        metadatas = [
            {
                "article_id": article_id,
                "chunk_index": i,
                "category": category,
            }
            for i in range(len(chunks))
        ]
        collection.add(
            ids=ids,
            embeddings=embeddings,
            documents=chunks,
            metadatas=metadatas,
        )
