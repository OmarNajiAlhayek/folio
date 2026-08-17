"""Exact-overlap detection: Arabic normalization, winnowed fingerprints, corpus store.

Only the dependency-free modules are re-exported here. ``corpus_store`` and
``exact_match_service`` need ``psycopg`` and are imported from their own modules,
so ``normalize``/``winnow`` stay usable (and testable) with a bare interpreter.
"""

from app.ml.exact_match.arabic_normalize import (
    Token,
    normalize_text,
    normalize_token,
    snippet_for_span,
    tokenize,
)
from app.ml.exact_match.config import ExactMatchConfig
from app.ml.exact_match.segmentation import (
    ReferenceSplit,
    find_reference_section,
    quote_spans,
    spans_cover,
    strip_reference_section,
)
from app.ml.exact_match.types import (
    TEXT_RETAINING_KINDS,
    CorpusDocument,
    DocumentOverlap,
    ExactMatchDependenciesError,
    ExactMatchReport,
    ExactMatchSpan,
    SourceKind,
)
from app.ml.exact_match.winnow import (
    FINGERPRINT_VERSION,
    fingerprint,
    shingle_hashes,
    token_hash,
    winnow,
)

__all__ = [
    "FINGERPRINT_VERSION",
    "TEXT_RETAINING_KINDS",
    "CorpusDocument",
    "DocumentOverlap",
    "ExactMatchConfig",
    "ExactMatchDependenciesError",
    "ExactMatchReport",
    "ExactMatchSpan",
    "ReferenceSplit",
    "SourceKind",
    "Token",
    "find_reference_section",
    "fingerprint",
    "normalize_text",
    "normalize_token",
    "quote_spans",
    "shingle_hashes",
    "snippet_for_span",
    "spans_cover",
    "strip_reference_section",
    "token_hash",
    "tokenize",
    "winnow",
]
