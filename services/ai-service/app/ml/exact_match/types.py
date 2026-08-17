"""Result and row types for exact-overlap detection."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum


class SourceKind(StrEnum):
    """Where a corpus document came from — drives display and confidentiality rules."""

    FOLIO_SUBMISSION = "folio_submission"
    BACK_CATALOG = "back_catalog"
    EXTERNAL_OA = "external_oa"
    # Pages fetched during a web check, cached as fingerprints only (never text):
    # every fetch permanently grows the corpus at ~40 bytes per kept k-gram.
    WEB = "web"


# Text may only be retained for documents the journal owns or that carry an
# explicit open licence. Everything else is fingerprint-only.
TEXT_RETAINING_KINDS: frozenset[SourceKind] = frozenset(
    {SourceKind.FOLIO_SUBMISSION, SourceKind.BACK_CATALOG},
)


class ExactMatchDependenciesError(RuntimeError):
    """Raised when psycopg is missing for the corpus store."""


class UnreadableSubmissionTextError(ValueError):
    """
    Manuscript text is extraction garbage (broken CMap / letter substitution).

    Surfaced as ``exact_error=unreadable_submission`` so the UI can say the file
    is unreadable instead of reporting a fake 0.0% clean pass.
    """

    ERROR_CODE = "unreadable_submission"

    def __init__(self, reason: str = "") -> None:
        self.reason = reason
        super().__init__(self.ERROR_CODE)


@dataclass(frozen=True)
class CorpusDocument:
    """A document indexed for exact matching."""

    source_kind: SourceKind
    source_ref: str
    title: str = ""
    authors: str = ""
    language: str = ""
    category: str = ""
    published_year: int | None = None
    source_url: str = ""
    license: str = ""
    submission_id: str | None = None
    doc_id: str | None = None
    token_count: int = 0


@dataclass(frozen=True)
class ExactMatchSpan:
    """One verbatim run shared between the submission and a corpus document."""

    submission_start_token: int
    submission_end_token: int
    submission_snippet: str
    source_start_token: int
    source_end_token: int
    matched_snippet: str
    token_length: int
    quoted: bool = False


@dataclass(frozen=True)
class DocumentOverlap:
    """All spans shared with a single corpus document, plus its share of the text."""

    doc_id: str
    source_kind: SourceKind
    source_ref: str
    title: str
    source_url: str
    submission_id: str | None
    matched_tokens: int
    overlap_ratio: float
    spans: list[ExactMatchSpan] = field(default_factory=list)


@dataclass(frozen=True)
class ExactMatchReport:
    """Document-level exact-overlap summary for one submission."""

    total_tokens: int
    matched_tokens: int
    overall_ratio: float
    quoted_tokens: int
    reference_tokens_skipped: int
    documents: list[DocumentOverlap] = field(default_factory=list)

    @property
    def overall_percent(self) -> float:
        return round(self.overall_ratio * 100, 2)
