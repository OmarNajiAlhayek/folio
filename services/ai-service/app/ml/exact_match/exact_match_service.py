"""Index documents into the exact-match corpus and detect verbatim overlap.

Detection is a four-step pipeline:

1. fingerprint the submission (references stripped, quotes flagged)
2. probe ``corpus_fingerprints`` for every kept hash, minus the boilerplate stoplist
3. merge hits per source document along a constant diagonal into runs
4. verify each run against retained original text (comparing normalized token
   texts) and extend it to the maximal exact run

Step 4 only runs for documents whose text we are allowed to keep; for
fingerprint-only sources the winnowing guarantee stands on its own (a 61-bit
rolling hash makes a false run vanishingly unlikely, and a run needs several
consecutive agreeing hashes anyway).
"""

from __future__ import annotations

import logging
from collections import defaultdict
from dataclasses import dataclass

from app.ml.exact_match.arabic_normalize import Token, snippet_for_span, tokenize
from app.ml.exact_match.config import ExactMatchConfig
from app.ml.exact_match.corpus_store import (
    CorpusStore,
    IndexResult,
    Posting,
    StoredDocument,
    content_digest,
)
from app.ml.exact_match.segmentation import quote_spans, spans_cover, strip_reference_section
from app.ml.exact_match.text_quality import TextQuality, assess_text
from app.ml.exact_match.types import (
    TEXT_RETAINING_KINDS,
    CorpusDocument,
    DocumentOverlap,
    ExactMatchReport,
    ExactMatchSpan,
    UnreadableSubmissionTextError,
)
from app.ml.exact_match.winnow import fingerprint

logger = logging.getLogger(__name__)


@dataclass
class _Run:
    """A candidate shared run on one diagonal (source_pos - submission_pos)."""

    sub_start: int
    sub_end: int  # exclusive, in tokens
    src_start: int
    src_end: int  # exclusive, in tokens


class ExactMatchService:
    """Fingerprint-index and exact-overlap detection over the corpus tables."""

    def __init__(
        self,
        store: CorpusStore,
        config: ExactMatchConfig | None = None,
    ) -> None:
        self._store = store
        self._config = config or ExactMatchConfig()
        self._config.validate()

    @property
    def config(self) -> ExactMatchConfig:
        return self._config

    # --------------------------------------------------------------- indexing

    def index_document(
        self,
        document: CorpusDocument,
        text: str,
        *,
        store_text: bool | None = None,
        strip_references: bool = True,
        skip_if_unchanged: bool = True,
    ) -> IndexResult:
        """
        Normalize, fingerprint, and persist one corpus document.

        ``store_text`` defaults to the licence-safe choice for the source kind:
        text is kept for Folio articles and the back catalogue, and dropped for
        external and web sources. Retained text is the original extract;
        normalization is only used for fingerprints and ``content_hash``.
        """
        # Postgres text rejects U+0000; space preserves length so Token offsets
        # into the retained body stay valid (\x00 is not \w).
        text = text.replace("\x00", " ")
        body = strip_reference_section(text).body if strip_references else text
        tokens = tokenize(body)
        words = [token.text for token in tokens]
        normalized = " ".join(words)
        fingerprints = fingerprint(words, self._config)

        keep_text = (
            document.source_kind in TEXT_RETAINING_KINDS if store_text is None else store_text
        )
        return self._store.upsert_document(
            document,
            fingerprints=fingerprints,
            token_count=len(words),
            retained_text=body if keep_text else None,
            content_hash=content_digest(normalized),
            skip_if_unchanged=skip_if_unchanged,
        )

    def refresh_stoplist(self) -> int:
        """Rebuild the common-shingle stoplist. Run after every bulk import."""
        return self._store.refresh_common_hashes(
            doc_ratio=self._config.common_hash_doc_ratio,
            min_docs=self._config.common_hash_min_docs,
            min_doc_freq=self._config.common_hash_min_doc_freq,
        )

    # -------------------------------------------------------------- detection

    def detect(
        self,
        submission_text: str,
        *,
        exclude_doc_ids: list[str] | None = None,
        exclude_submission_ids: list[str] | None = None,
    ) -> ExactMatchReport:
        """
        Find verbatim overlap between ``submission_text`` and the corpus.

        ``exclude_submission_ids`` must carry the submission's own id (and any
        earlier version of it), otherwise a resubmission matches itself at 100%.
        """
        quality = assess_text(submission_text)
        if quality.quality is TextQuality.BROKEN:
            raise UnreadableSubmissionTextError(quality.reason)

        split = strip_reference_section(submission_text)
        body = split.body
        quotes = quote_spans(body)
        tokens = tokenize(body)
        words = [token.text for token in tokens]
        total_tokens = len(words)

        empty = ExactMatchReport(
            total_tokens=total_tokens,
            matched_tokens=0,
            overall_ratio=0.0,
            quoted_tokens=0,
            reference_tokens_skipped=self._reference_token_count(submission_text, split.body),
            documents=[],
        )
        if total_tokens < self._config.min_match_tokens:
            return empty

        query_fp = fingerprint(words, self._config)
        if not query_fp:
            return empty

        positions_by_hash: dict[int, list[int]] = defaultdict(list)
        for hash_value, position in query_fp:
            positions_by_hash[hash_value].append(position)

        postings = self._fetch_postings(
            list(positions_by_hash.keys()),
            exclude_doc_ids=exclude_doc_ids,
            exclude_submission_ids=exclude_submission_ids,
        )
        if not postings:
            return empty

        pairs_by_doc: dict[str, list[tuple[int, int]]] = defaultdict(list)
        for posting in postings:
            for sub_pos in positions_by_hash.get(posting.hash, ()):
                pairs_by_doc[posting.doc_id].append((sub_pos, posting.word_pos))

        documents = self._store.get_documents(
            list(pairs_by_doc.keys()),
            with_text=self._config.verify_with_stored_text,
        )

        overlaps: list[DocumentOverlap] = []
        matched_positions: set[int] = set()
        quoted_positions: set[int] = set()

        for doc_id, pairs in pairs_by_doc.items():
            stored = documents.get(doc_id)
            if stored is None:
                continue
            runs = self._merge_runs(pairs)
            # Tokenize retained original once per candidate (verify + snippets).
            source_tokens = (
                tokenize(stored.retained_text) if stored.retained_text else []
            )
            runs = self._verify_and_extend(runs, words, source_tokens)
            runs = [r for r in runs if r.sub_end - r.sub_start >= self._config.min_match_tokens]
            if not runs:
                continue

            overlap = self._build_overlap(
                stored=stored,
                runs=runs,
                body=body,
                tokens=tokens,
                source_tokens=source_tokens,
                quotes=quotes,
                total_tokens=total_tokens,
            )
            overlaps.append(overlap)
            for run in runs:
                span_positions = range(run.sub_start, run.sub_end)
                matched_positions.update(span_positions)
                if self._run_is_quoted(run, tokens, quotes):
                    quoted_positions.update(span_positions)

        overlaps = self._collapse_duplicate_documents(overlaps, documents)
        overlaps.sort(key=lambda o: o.matched_tokens, reverse=True)
        overlaps = overlaps[: self._config.max_sources]

        matched_tokens = len(matched_positions)
        return ExactMatchReport(
            total_tokens=total_tokens,
            matched_tokens=matched_tokens,
            overall_ratio=matched_tokens / total_tokens if total_tokens else 0.0,
            quoted_tokens=len(quoted_positions),
            reference_tokens_skipped=self._reference_token_count(submission_text, split.body),
            documents=overlaps,
        )

    # ---------------------------------------------------------------- helpers

    @staticmethod
    def _collapse_duplicate_documents(
        overlaps: list[DocumentOverlap],
        documents: dict[str, StoredDocument],
    ) -> list[DocumentOverlap]:
        """
        One article indexed twice must be reported once.

        The same paper routinely reaches the corpus from two directions: the
        journal's own PDF (``back_catalog``, text retained, so its spans are
        verified and quotable) and the OAI-PMH harvest of the same issue
        (``external_oa``, fingerprints only). Both match, so an editor who
        copied a single article is shown two sources and reads it as
        plagiarism from two separate places.

        Only byte-identical text is collapsed — same ``content_hash``, so the
        two rows provably carry the same article, not merely a similar one.
        The survivor is the copy that can show the editor the matched passage;
        matched-token count only breaks ties, because a fingerprint-only copy
        reports a slightly looser upper bound and would otherwise win.

        This is presentation only: ``matched_positions`` is accumulated before
        this runs, so the overall percentage is unchanged either way.
        """

        def evidence_rank(overlap: DocumentOverlap) -> tuple[int, int]:
            stored = documents.get(overlap.doc_id)
            quotable = int(stored is not None and stored.source_kind in TEXT_RETAINING_KINDS)
            return (quotable, overlap.matched_tokens)

        best: dict[str, DocumentOverlap] = {}
        # A document whose digest is unknown cannot be proven a duplicate of
        # anything, so it passes through rather than being grouped under "".
        ungrouped: list[DocumentOverlap] = []

        for overlap in overlaps:
            stored = documents.get(overlap.doc_id)
            digest = stored.content_hash if stored is not None else ""
            if not digest:
                ungrouped.append(overlap)
                continue
            incumbent = best.get(digest)
            if incumbent is None or evidence_rank(overlap) > evidence_rank(incumbent):
                best[digest] = overlap

        return [*best.values(), *ungrouped]

    def _reference_token_count(self, full_text: str, body: str) -> int:
        if len(body) >= len(full_text):
            return 0
        return len(tokenize(full_text[len(body) :]))

    def _fetch_postings(
        self,
        hashes: list[int],
        *,
        exclude_doc_ids: list[str] | None,
        exclude_submission_ids: list[str] | None,
    ) -> list[Posting]:
        batch = self._config.hash_query_batch
        postings: list[Posting] = []
        for start in range(0, len(hashes), batch):
            postings.extend(
                self._store.query_postings(
                    hashes[start : start + batch],
                    max_postings_per_hash=self._config.max_postings_per_hash,
                    exclude_doc_ids=exclude_doc_ids,
                    exclude_submission_ids=exclude_submission_ids,
                ),
            )
        return postings

    def _merge_runs(self, pairs: list[tuple[int, int]]) -> list[_Run]:
        """
        Group hits into runs along a constant diagonal.

        Both sides went through the same normalizer, so a verbatim copy keeps
        ``source_pos - submission_pos`` exactly constant; only the gap between kept
        fingerprints varies (winnowing keeps roughly one hash per window).
        """
        k = self._config.k_gram
        max_gap = self._config.max_gap_tokens

        by_diagonal: dict[int, list[tuple[int, int]]] = defaultdict(list)
        for sub_pos, src_pos in pairs:
            by_diagonal[src_pos - sub_pos].append((sub_pos, src_pos))

        runs: list[_Run] = []
        for diagonal_pairs in by_diagonal.values():
            diagonal_pairs.sort()
            run_start_sub, run_start_src = diagonal_pairs[0]
            last_sub, last_src = diagonal_pairs[0]
            for sub_pos, src_pos in diagonal_pairs[1:]:
                if sub_pos - last_sub > max_gap:
                    runs.append(
                        _Run(
                            sub_start=run_start_sub,
                            sub_end=last_sub + k,
                            src_start=run_start_src,
                            src_end=last_src + k,
                        ),
                    )
                    run_start_sub, run_start_src = sub_pos, src_pos
                last_sub, last_src = sub_pos, src_pos
            runs.append(
                _Run(
                    sub_start=run_start_sub,
                    sub_end=last_sub + k,
                    src_start=run_start_src,
                    src_end=last_src + k,
                ),
            )
        return runs

    def _verify_and_extend(
        self,
        runs: list[_Run],
        words: list[str],
        source_tokens: list[Token],
    ) -> list[_Run]:
        """
        Confirm each run token-by-token against retained original text, comparing
        normalized token texts, and grow each run to the maximal exact stretch.

        Without retained source text the runs pass through unverified — the
        winnowing guarantee is the evidence in that case.
        """
        if not self._config.verify_with_stored_text or not source_tokens:
            return runs

        source_words = [token.text for token in source_tokens]
        verified: list[_Run] = []
        for run in runs:
            verified.extend(self._common_runs(run, words, source_words))
        return self._dedupe_runs(verified)

    def _common_runs(
        self,
        run: _Run,
        words: list[str],
        source_words: list[str],
    ) -> list[_Run]:
        """
        Every identical stretch inside a candidate run, each extended outwards.

        A candidate is built by merging hits that share a diagonal and lie within
        ``max_gap_tokens``, so one candidate routinely spans *many* separate
        verbatim stretches — that is the shape of "copy the article and change a
        word here and there", where a single edited token every 20 words still
        leaves the whole document copied. Returning only the longest stretch would
        report one paragraph and hide the rest of the copy.
        """
        diagonal = run.src_start - run.sub_start
        # Clamp so every index into ``source_words`` below is in range.
        sub_lo = max(0, run.sub_start, -diagonal)
        sub_hi = min(len(words), run.sub_end, len(source_words) - diagonal)

        stretches: list[tuple[int, int]] = []
        start = -1
        for i in range(sub_lo, sub_hi):
            if words[i] == source_words[i + diagonal]:
                if start < 0:
                    start = i
            elif start >= 0:
                stretches.append((start, i))
                start = -1
        if start >= 0:
            stretches.append((start, sub_hi))

        if not stretches:
            logger.debug("Discarded unverified run at submission token %d", run.sub_start)
            return []

        verified: list[_Run] = []
        for begin, end in stretches:
            # Only the stretches touching a candidate edge can actually grow: the
            # interior ones are bounded by tokens that already differ, so both
            # loops exit immediately.
            while (
                begin > 0
                and begin + diagonal > 0
                and words[begin - 1] == source_words[begin - 1 + diagonal]
            ):
                begin -= 1
            while (
                end < len(words)
                and end + diagonal < len(source_words)
                and words[end] == source_words[end + diagonal]
            ):
                end += 1
            # Filtered here as well as in `detect` because `_dedupe_runs` is
            # quadratic, and an edited copy yields one short stretch per token.
            if end - begin >= self._config.min_match_tokens:
                verified.append(
                    _Run(
                        sub_start=begin,
                        sub_end=end,
                        src_start=begin + diagonal,
                        src_end=end + diagonal,
                    ),
                )
        return verified

    @staticmethod
    def _dedupe_runs(runs: list[_Run]) -> list[_Run]:
        """Drop runs fully contained in another (extension can make neighbours converge)."""
        if len(runs) < 2:
            return runs
        ordered = sorted(runs, key=lambda r: (r.sub_start, -(r.sub_end - r.sub_start)))
        kept: list[_Run] = []
        for run in ordered:
            if any(
                other.sub_start <= run.sub_start
                and other.sub_end >= run.sub_end
                and other.src_start <= run.src_start
                and other.src_end >= run.src_end
                for other in kept
            ):
                continue
            kept.append(run)
        return kept

    @staticmethod
    def _run_is_quoted(run: _Run, tokens: list[Token], quotes: list[tuple[int, int]]) -> bool:
        if not quotes or run.sub_start >= len(tokens):
            return False
        end_idx = min(run.sub_end, len(tokens)) - 1
        return spans_cover(quotes, tokens[run.sub_start].start, tokens[end_idx].end)

    def _build_overlap(
        self,
        *,
        stored: StoredDocument,
        runs: list[_Run],
        body: str,
        tokens: list[Token],
        source_tokens: list[Token],
        quotes: list[tuple[int, int]],
        total_tokens: int,
    ) -> DocumentOverlap:
        retained = stored.retained_text or ""
        spans: list[ExactMatchSpan] = []
        covered: set[int] = set()

        for run in sorted(runs, key=lambda r: r.sub_end - r.sub_start, reverse=True):
            covered.update(range(run.sub_start, run.sub_end))
            if len(spans) >= self._config.max_spans_per_source:
                continue
            matched_snippet = (
                snippet_for_span(retained, source_tokens, run.src_start, run.src_end)
                if retained and source_tokens
                else ""
            )
            spans.append(
                ExactMatchSpan(
                    submission_start_token=run.sub_start,
                    submission_end_token=run.sub_end,
                    submission_snippet=snippet_for_span(body, tokens, run.sub_start, run.sub_end),
                    source_start_token=run.src_start,
                    source_end_token=run.src_end,
                    matched_snippet=matched_snippet,
                    token_length=run.sub_end - run.sub_start,
                    quoted=self._run_is_quoted(run, tokens, quotes),
                ),
            )

        matched_tokens = len(covered)
        return DocumentOverlap(
            doc_id=stored.doc_id,
            source_kind=stored.source_kind,
            source_ref=stored.source_ref,
            title=stored.title,
            source_url=stored.source_url,
            submission_id=stored.submission_id,
            matched_tokens=matched_tokens,
            overlap_ratio=matched_tokens / total_tokens if total_tokens else 0.0,
            spans=spans,
        )
