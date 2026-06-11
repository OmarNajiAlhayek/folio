"""Vector persistence contract (pgvector implementation)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class SummaryRow:
    submission_id: str
    embedding: list[float]
    summary_text: str
    abstract: str
    keywords: str
    category: str


@dataclass(frozen=True)
class ChunkRow:
    article_id: str
    chunk_index: int
    embedding: list[float]
    chunk_text: str
    category: str


@dataclass(frozen=True)
class SimilarSummaryHit:
    submission_id: str
    abstract: str
    keywords: str
    category: str
    similarity: float


@dataclass(frozen=True)
class SimilarChunkHit:
    article_id: str
    chunk_index: int
    chunk_text: str
    category: str
    similarity: float


@dataclass(frozen=True)
class ReviewerBioRow:
    reviewer_id: str
    embedding: list[float]
    bio_text: str
    display_name: str | None = None


@dataclass(frozen=True)
class SubmissionSummaryLookup:
    submission_id: str
    embedding: list[float]
    summary_text: str


class VectorStore(Protocol):
    """Persistence for article/reviewer embeddings backed by pgvector."""

    def close(self) -> None: ...

    def upsert_summary(self, row: SummaryRow) -> None: ...

    def get_summary(self, submission_id: str) -> SummaryRow | None: ...

    def delete_summary(self, submission_id: str) -> None: ...

    def query_similar_summaries(
        self,
        embedding: list[float],
        *,
        limit: int,
        category: str | None = None,
        exclude_submission_id: str | None = None,
    ) -> list[SimilarSummaryHit]: ...

    def get_submission_summaries_by_ids(
        self,
        submission_ids: list[str],
    ) -> list[SubmissionSummaryLookup]: ...

    def replace_chunks(self, article_id: str, rows: list[ChunkRow]) -> None:
        """Atomically delete existing chunks for article_id and insert rows."""

    def delete_chunks(self, article_id: str) -> None: ...

    def query_similar_chunks(
        self,
        embeddings: list[list[float]],
        *,
        limit_per_query: int,
        category: str | None = None,
    ) -> list[list[SimilarChunkHit]]: ...

    def upsert_reviewer_bio(self, row: ReviewerBioRow) -> None: ...

    def delete_reviewer_bio(self, reviewer_id: str) -> None: ...

    def list_reviewer_ids(self) -> list[str]: ...

    def get_reviewer_bios(self, reviewer_ids: list[str]) -> list[ReviewerBioRow]: ...
