"""Shared types and exceptions for the vector search package."""

from __future__ import annotations

from dataclasses import dataclass


class VectorDependenciesError(ImportError):
    """Raised when chromadb, sentence-transformers, or pyarabic are missing."""


class ArticleNotIndexedError(ValueError):
    """Raised when an article_id is not present in the summary collection."""


@dataclass(frozen=True)
class IngestResult:
    article_id: str
    summary_indexed: int
    chunks_indexed: int


@dataclass(frozen=True)
class SimilarArticleHit:
    article_id: str
    abstract: str
    keywords: str
    category: str
    similarity: float


@dataclass(frozen=True)
class SearchHit:
    article_id: str
    snippet: str
    score: float


@dataclass(frozen=True)
class ReviewerSuggestionHit:
    reviewer_id: str
    final_score: float
    bio_score: float
    history_score: float
    ce_bio_score: float | None = None
    ce_history_score: float | None = None
    used_cross_encoder: bool = False


@dataclass(frozen=True)
class PlagiarismMatch:
    submission_chunk_index: int
    submission_snippet: str
    source_article_id: str
    source_chunk_index: int
    matched_snippet: str
    similarity: float
