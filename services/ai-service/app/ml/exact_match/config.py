"""Tuning for the winnowed-fingerprint exact matcher."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ExactMatchConfig:
    """
    Fingerprint and match-merge parameters.

    ``k_gram`` is the noise threshold (overlaps shorter than ``k_gram`` tokens are
    invisible); ``k_gram + window - 1`` is the *guarantee* threshold — winnowing
    provably detects every shared run at least that long. Changing either
    invalidates the stored corpus: re-run the importers after a change.
    """

    k_gram: int = 6
    window: int = 8

    # Reporting floor. Defaults to the winnowing guarantee (k + w - 1 = 13).
    min_match_tokens: int = 13

    # Merging fingerprint hits into runs. Winnowing keeps roughly 2/(w+1) of
    # positions, so consecutive kept hits are several tokens apart even inside a
    # verbatim copy; the gap allowance has to exceed that spacing.
    max_gap_tokens: int = 24
    diagonal_tolerance: int = 6

    # Boilerplate suppression. A hash present in more than this share of corpus
    # documents is journal template text, not evidence of copying.
    common_hash_doc_ratio: float = 0.01
    # Never stoplist a hash below this document frequency, however small the
    # corpus: real copying shows up in 2-3 documents, and on a 30-document corpus
    # a pure ratio would round down to 2 and suppress exactly the signal wanted.
    common_hash_min_doc_freq: int = 5
    # Below this many documents the ratio means nothing, so no stoplist is built.
    common_hash_min_docs: int = 20
    max_postings_per_hash: int = 5000

    hash_query_batch: int = 4000
    max_sources: int = 10
    max_spans_per_source: int = 5

    # Verify fingerprint runs against retained original text (normalized token
    # comparison) when available, and
    # extend them to the maximal exact token run.
    verify_with_stored_text: bool = True

    def guarantee_tokens(self) -> int:
        """Shortest overlap winnowing is guaranteed to catch."""
        return self.k_gram + self.window - 1

    def validate(self) -> None:
        if self.k_gram < 2:
            raise ValueError("k_gram must be >= 2")
        if self.window < 1:
            raise ValueError("window must be >= 1")
        if self.min_match_tokens < self.k_gram:
            raise ValueError("min_match_tokens must be >= k_gram")
        if not 0 < self.common_hash_doc_ratio <= 1:
            raise ValueError("common_hash_doc_ratio must be in (0, 1]")
