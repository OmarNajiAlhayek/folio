"""Ground-truth benchmark for the exact-match plagiarism detector.

The unit tests prove the pieces work and the live gRPC test proves the two
extremes (a document matches itself, scrambled text does not). Neither answers
the question an editor actually cares about: *when a manuscript is 30% copied,
does the report say 30%?*

This script answers it by construction. Synthetic manuscripts are assembled from
text the corpus already stores, so the injected token count is known exactly and
the expected overlap is arithmetic rather than a guess::

    expected_ratio = injected_tokens / (injected_tokens + filler_tokens)

Filler is real Arabic with its word order shuffled. That keeps authentic
vocabulary and token statistics — the tokenizer, the stoplist and the hash
distribution all behave as they would on a real manuscript — while destroying
every k-gram, so any overlap it reports is a false positive.

Detection runs against the *whole* corpus, so every case doubles as a precision
test: a source that comes back other than the one injected is a false positive
drawn from thousands of candidate documents.

Usage (from ``services/ai-service``, needs the corpus Postgres up)::

    python scripts/plagiarism_bench.py
    python scripts/plagiarism_bench.py --json report.json
    python scripts/plagiarism_bench.py --manuscript-tokens 4000
"""

from __future__ import annotations

import argparse
import json
import logging
import random
import sys
import time
from dataclasses import dataclass, field, replace
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import get_settings  # noqa: E402
from app.ml.exact_match.arabic_normalize import tokenize  # noqa: E402
from app.ml.exact_match.config import ExactMatchConfig  # noqa: E402
from app.ml.exact_match.corpus_store import CorpusStore, close_corpus_pool  # noqa: E402
from app.ml.exact_match.exact_match_service import ExactMatchService  # noqa: E402
from app.ml.exact_match.types import ExactMatchReport  # noqa: E402
from app.ml.vector.pg_pool import VectorDbConfig  # noqa: E402

logger = logging.getLogger("plagiarism_bench")

# Deterministic: the same corpus must produce the same benchmark twice.
SEED = 20260809

# Default synthetic manuscript length. Real Damascus articles run 3-6k tokens.
DEFAULT_MANUSCRIPT_TOKENS = 3000

# Ratio points are accepted within this many percentage points of ground truth.
# Winnowing never selects k-grams at a document's edges, so a block can lose a
# few tokens at each seam even after the verify-and-extend pass.
RATIO_TOLERANCE_PP = 3.0

# A source document must be at least this long to carve blocks out of.
MIN_SOURCE_TOKENS = 2500

# Material screening. Shared stock sentences are fine; a long shared run means the
# document is a duplicate or a compound scan and cannot serve as clean material.
MAX_BASELINE_OVERLAP = 0.02
MAX_BASELINE_SPAN = 40


def db_config() -> VectorDbConfig:
    settings = get_settings()
    return VectorDbConfig(
        host=settings.vector_db_host,
        port=settings.vector_db_port,
        user=settings.vector_db_user,
        password=settings.vector_db_password,
        database=settings.vector_db_database,
        ssl=settings.vector_db_ssl,
    )


@dataclass
class SourceDoc:
    """A corpus document whose text we kept, usable as plagiarism material."""

    doc_id: str
    title: str
    words: list[str]
    # Documents this one already shares boilerplate with. Tolerated in results
    # rather than counted as false positives.
    baseline_docs: set[str] = field(default_factory=set)
    # Rows holding byte-identical text — the same article reached twice, once as
    # a back-catalogue scan and once as an OAI harvest. Not other documents, so
    # screening must look past them or no material ever reads as clean.
    twin_docs: set[str] = field(default_factory=set)

    @property
    def short_title(self) -> str:
        return (self.title[:48] + "…") if len(self.title) > 48 else self.title


@dataclass
class Case:
    """One synthetic manuscript with a known correct answer."""

    name: str
    question: str
    text: str
    expected_ratio: float
    expected_sources: set[str] = field(default_factory=set)
    # May appear without being an error — the material's pre-existing boilerplate
    # matches, which are correct answers about the corpus, not matcher mistakes.
    allowed_sources: set[str] = field(default_factory=set)
    # Cases where the honest expectation is "detects less than was injected"
    # (paraphrase, sub-floor runs) assert a bound instead of a target.
    max_ratio: float | None = None
    # None = do not check, True = must be labelled quoted, False = must not be.
    expect_quoted: bool | None = None
    expect_references_skipped: bool = False
    tolerance_pp: float = RATIO_TOLERANCE_PP
    note: str = ""
    # Documents to hide from this case. Only the sub-floor cases use it, and only
    # to hide the material's fingerprint-only twin: their claim ("a run this
    # short is discarded") is a statement about the verify-and-extend step, which
    # a twin without stored text never reaches. Leaving the twin visible makes
    # the case pass or fail on whether the corpus happens to hold a second copy
    # rather than on the matcher. The twin's behaviour is not swept away — it is
    # measured in the fingerprint-only table below.
    exclude_docs: set[str] = field(default_factory=set)


@dataclass
class Result:
    case: Case
    report: ExactMatchReport
    elapsed_s: float

    @property
    def detected_pct(self) -> float:
        return round(self.report.overall_ratio * 100, 2)

    @property
    def expected_pct(self) -> float:
        return round(self.case.expected_ratio * 100, 2)

    @property
    def found_sources(self) -> set[str]:
        return {doc.doc_id for doc in self.report.documents}

    @property
    def false_positive_sources(self) -> set[str]:
        return self.found_sources - self.case.expected_sources - self.case.allowed_sources

    @property
    def missing_sources(self) -> set[str]:
        return self.case.expected_sources - self.found_sources

    def failures(self) -> list[str]:
        """Every way this case disagrees with its ground truth."""
        problems: list[str] = []
        case = self.case

        if case.max_ratio is not None:
            if self.report.overall_ratio > case.max_ratio:
                problems.append(
                    f"ratio {self.detected_pct}% exceeds ceiling {round(case.max_ratio * 100, 2)}%",
                )
        elif abs(self.detected_pct - self.expected_pct) > case.tolerance_pp:
            problems.append(
                f"ratio {self.detected_pct}% is off ground truth "
                f"{self.expected_pct}% by more than {case.tolerance_pp}pp",
            )

        if self.missing_sources:
            problems.append(f"missed {len(self.missing_sources)} injected source(s)")
        if self.false_positive_sources:
            problems.append(f"{len(self.false_positive_sources)} false-positive source(s)")
        if case.expect_quoted is True and self.report.quoted_tokens == 0:
            problems.append("quoted passage was not flagged as quoted")
        if case.expect_quoted is False and self.report.quoted_tokens > 0:
            problems.append(
                f"{self.report.quoted_tokens} tokens flagged quoted, expected none",
            )
        if case.expect_references_skipped and self.report.reference_tokens_skipped == 0:
            problems.append("reference section was not stripped")
        return problems


# --------------------------------------------------------------- corpus access


def load_candidates(store: CorpusStore, count: int) -> list[SourceDoc]:
    """Text-retaining corpus documents long enough to carve blocks out of."""
    with store._pool.connection() as conn, conn.cursor() as cur:  # noqa: SLF001
        cur.execute(
            """
            SELECT d.id::text, coalesce(d.title, ''), d.retained_text,
                   coalesce(
                     (SELECT array_agg(t.id::text)
                      FROM corpus_documents t
                      WHERE t.content_hash = d.content_hash AND t.id <> d.id),
                     '{}'
                   )
            FROM corpus_documents d
            WHERE d.retained_text IS NOT NULL AND d.token_count >= %s
            ORDER BY d.token_count DESC, d.id
            LIMIT %s
            """,
            (MIN_SOURCE_TOKENS, count),
        )
        rows = cur.fetchall()
    from app.ml.exact_match.arabic_normalize import tokenize  # noqa: PLC0415

    return [
        SourceDoc(
            doc_id=r[0],
            title=r[1],
            # Normalized tokens (same stream fingerprints use); retained_text is original.
            words=[t.text for t in tokenize(r[2])],
            twin_docs=set(r[3] or ()),
        )
        for r in rows
    ]


def select_clean_material(
    service: ExactMatchService,
    candidates: list[SourceDoc],
    wanted: int,
) -> tuple[list[SourceDoc], list[tuple[SourceDoc, float, int, int]]]:
    """
    Keep documents that do not already overlap something else in the corpus.

    Material has to be *known* clean, not assumed clean. Damascus articles reach
    this corpus twice — once as a back-catalogue scan with retained text, once as
    an OAI harvest without it — so a manuscript built from the wrong document
    matches its own twin and the extra source looks like a false positive when it
    is the correct answer. Screening keeps the benchmark measuring the matcher
    rather than corpus hygiene.

    A little overlap is unavoidable: journals share stock methodology sentences
    that clear the 13-token floor. Those documents stay usable, with their
    pre-existing matches recorded as tolerated rather than expected.
    """
    clean: list[SourceDoc] = []
    rejected: list[tuple[SourceDoc, float, int, int]] = []
    for candidate in candidates:
        report = service.detect(
            " ".join(candidate.words),
            exclude_doc_ids=[candidate.doc_id, *candidate.twin_docs],
        )
        longest = max(
            (span.token_length for doc in report.documents for span in doc.spans),
            default=0,
        )
        if report.overall_ratio > MAX_BASELINE_OVERLAP or longest > MAX_BASELINE_SPAN:
            rejected.append(
                (candidate, report.overall_ratio, len(report.documents), longest),
            )
            continue
        # Twins are tolerated too: detection collapses them to one reported
        # source, but whichever copy survives must not read as a false positive.
        candidate.baseline_docs = {doc.doc_id for doc in report.documents} | candidate.twin_docs
        clean.append(candidate)
        if len(clean) >= wanted:
            break
    return clean, rejected


def corpus_size(store: CorpusStore) -> tuple[int, int]:
    stats = store.stats()
    docs = sum(v["documents"] for v in stats["documents_by_kind"].values())
    return docs, stats["fingerprints"]


# ------------------------------------------------------------- text assembly


class Filler:
    """Word-shuffled real Arabic: authentic vocabulary, zero surviving k-grams."""

    def __init__(self, sources: list[SourceDoc], rng: random.Random) -> None:
        pool: list[str] = []
        for source in sources:
            pool.extend(source.words)
        rng.shuffle(pool)
        self._pool = pool
        self._cursor = 0

    def take(self, count: int) -> list[str]:
        if count <= 0:
            return []
        out: list[str] = []
        while len(out) < count:
            chunk = self._pool[self._cursor : self._cursor + (count - len(out))]
            if not chunk:  # wrapped past the end of the pool
                self._cursor = 0
                continue
            out.extend(chunk)
            self._cursor += len(chunk)
        return out


def replacement_for(filler: Filler, original: str) -> str:
    """A filler word guaranteed to differ from ``original``."""
    for _ in range(8):
        candidate = filler.take(1)[0]
        if candidate != original:
            return candidate
    return "زطمقس"  # not a word; only reached if the pool is degenerate


def block(source: SourceDoc, count: int, *, offset_ratio: float = 0.25) -> list[str]:
    """A contiguous run of ``count`` words from the middle of ``source``."""
    start = min(int(len(source.words) * offset_ratio), max(0, len(source.words) - count))
    return source.words[start : start + count]


def assemble(parts: list[list[str]]) -> str:
    """Join word runs into a manuscript, one blank line between parts."""
    return "\n\n".join(" ".join(part) for part in parts if part)


def token_count(text: str) -> int:
    return len(tokenize(text))


# ------------------------------------------------------------------- the cases


def build_cases(
    sources: list[SourceDoc],
    filler: Filler,
    manuscript_tokens: int,
    config: ExactMatchConfig,
) -> list[Case]:
    primary, second, third = sources[0], sources[1], sources[2]
    cases: list[Case] = []

    def injected_case(
        name: str,
        question: str,
        percent: int,
        source: SourceDoc,
        note: str = "",
    ) -> Case:
        injected = int(manuscript_tokens * percent / 100)
        body = block(source, injected)
        rest = manuscript_tokens - len(body)
        # Copied text sits in the middle, the way a lifted section would.
        text = assemble([filler.take(rest // 2), body, filler.take(rest - rest // 2)])
        total = token_count(text)
        return Case(
            name=name,
            question=question,
            text=text,
            expected_ratio=len(body) / total,
            expected_sources={source.doc_id},
            allowed_sources=source.baseline_docs,
            note=note,
        )

    # ---- calibration: is the reported percentage numerically right? ----------
    cases.append(
        Case(
            name="clean",
            question="Does original work come back clean?",
            text=assemble([filler.take(manuscript_tokens)]),
            expected_ratio=0.0,
            note="shuffled Arabic — real vocabulary, no shared k-grams",
        ),
    )
    for percent in (10, 30, 50, 80):
        cases.append(
            injected_case(
                f"copied-{percent}pct",
                f"Is a {percent}% lift reported as {percent}%?",
                percent,
                primary,
            ),
        )

    full_text = " ".join(primary.words)
    cases.append(
        Case(
            name="copied-whole",
            question="Is a wholesale copy caught at ~100%?",
            text=full_text,
            expected_ratio=1.0,
            expected_sources={primary.doc_id},
            allowed_sources=primary.baseline_docs,
            tolerance_pp=5.0,
            note="whole article resubmitted verbatim",
        ),
    )

    # ---- attribution: are the right sources named? ---------------------------
    mosaic_each = int(manuscript_tokens * 0.12)
    mosaic_blocks = [
        block(primary, mosaic_each, offset_ratio=0.10),
        block(second, mosaic_each, offset_ratio=0.30),
        block(third, mosaic_each, offset_ratio=0.50),
    ]
    injected_total = sum(len(b) for b in mosaic_blocks)
    gap = (manuscript_tokens - injected_total) // 4
    mosaic_text = assemble(
        [
            filler.take(gap),
            mosaic_blocks[0],
            filler.take(gap),
            mosaic_blocks[1],
            filler.take(gap),
            mosaic_blocks[2],
            filler.take(gap),
        ],
    )
    mosaic_total = token_count(mosaic_text)
    cases.append(
        Case(
            name="mosaic-3-sources",
            question="Are all three plundered articles named?",
            text=mosaic_text,
            expected_ratio=injected_total / mosaic_total,
            expected_sources={primary.doc_id, second.doc_id, third.doc_id},
            allowed_sources=(primary.baseline_docs | second.baseline_docs | third.baseline_docs),
            note="12% lifted from each of three different articles",
        ),
    )

    # ---- thresholds: does the reporting floor behave? ------------------------
    floor = config.min_match_tokens
    for label, run_length, expect in (
        ("below-floor", floor - 1, False),
        ("at-floor", floor + 1, True),
    ):
        run = block(primary, run_length, offset_ratio=0.65)
        text = assemble(
            [filler.take(manuscript_tokens // 2), run, filler.take(manuscript_tokens // 2)],
        )
        total = token_count(text)
        cases.append(
            Case(
                name=f"{label}-{run_length}-tokens",
                question=(
                    f"Is a {run_length}-token phrase ignored as coincidence?"
                    if not expect
                    else f"Is a {run_length}-token phrase still caught?"
                ),
                text=text,
                expected_ratio=(len(run) / total) if expect else 0.0,
                expected_sources={primary.doc_id} if expect else set(),
                allowed_sources=primary.baseline_docs,
                max_ratio=None if expect else 0.0,
                tolerance_pp=1.0,
                exclude_docs=set() if expect else primary.twin_docs,
                note=f"min_match_tokens={floor}",
            ),
        )

    # ---- carve-outs: quotes and bibliographies -------------------------------
    # Two quote sizes: one a plausible block quote, one past the guard that stops
    # a stray opening mark from swallowing the document.
    for label, tokens_quoted, expect_flag in (
        ("quoted-block", 150, True),
        ("quoted-oversized", 700, False),
    ):
        quoted_block = block(primary, tokens_quoted, offset_ratio=0.40)
        quoted_text = assemble(
            [
                filler.take(manuscript_tokens // 2),
                ["«", *quoted_block, "»"],
                filler.take(manuscript_tokens // 2),
            ],
        )
        quoted_chars = sum(len(word) + 1 for word in quoted_block)
        quoted_total = token_count(quoted_text)
        cases.append(
            Case(
                name=label,
                question=(
                    "Is an attributed quotation flagged as quoted, not hidden?"
                    if expect_flag
                    else "What happens to a quotation past the quote-length guard?"
                ),
                text=quoted_text,
                expected_ratio=len(quoted_block) / quoted_total,
                expected_sources={primary.doc_id},
                allowed_sources=primary.baseline_docs,
                expect_quoted=expect_flag,
                note=(
                    f"{tokens_quoted} tokens ≈ {quoted_chars} chars — "
                    + (
                        "counted in the overlap and labelled for the editor"
                        if expect_flag
                        else "over _MAX_QUOTE_CHARS, so counted but NOT labelled"
                    )
                ),
            ),
        )

    refs_block = block(primary, int(manuscript_tokens * 0.30), offset_ratio=0.55)
    refs_text = (
        assemble([filler.take(manuscript_tokens)]) + "\n\nالمراجع\n\n" + " ".join(refs_block)
    )
    cases.append(
        Case(
            name="references-only",
            question="Is shared bibliography excluded from the score?",
            text=refs_text,
            expected_ratio=0.0,
            expected_sources=set(),
            max_ratio=0.0,
            expect_references_skipped=True,
            note="identical text placed after a المراجع heading",
        ),
    )

    # ---- the honest limitation: paraphrase -----------------------------------
    for every in (5, 10, 20, 50):
        words = list(primary.words[:manuscript_tokens])
        for i in range(every - 1, len(words), every):
            # Must differ from the original, or the "edit" silently joins two runs
            # and the case stops testing the run length it claims to test.
            words[i] = replacement_for(filler, words[i])
        text = assemble([words])
        total = token_count(text)
        run_length = every - 1
        survives = run_length >= config.min_match_tokens
        cases.append(
            Case(
                name=f"paraphrase-every-{every}th",
                question=f"Does swapping 1 word in {every} defeat detection?",
                text=text,
                # A run of every-1 clean tokens is only reportable when it clears
                # the floor; below that the honest expectation is zero.
                expected_ratio=(run_length / every) if survives else 0.0,
                expected_sources={primary.doc_id} if survives else set(),
                allowed_sources=primary.baseline_docs,
                max_ratio=None if survives else 0.02,
                tolerance_pp=5.0 if survives else RATIO_TOLERANCE_PP,
                exclude_docs=set() if survives else primary.twin_docs,
                note=(
                    f"leaves runs of {run_length} clean tokens"
                    + ("" if survives else f" — under the {config.min_match_tokens} floor")
                ),
            ),
        )

    return cases


# ---------------------------------------------------------------------- output


def print_report(results: list[Result], docs: int, fingerprints: int) -> bool:
    print()
    print(f"Corpus: {docs:,} documents · {fingerprints:,} fingerprints")
    print()
    header = (
        f"{'case':<26}{'injected':>10}{'reported':>10}{'delta':>9}{'srcs':>7}{'time':>8}  verdict"
    )
    print(header)
    print("-" * len(header))

    all_passed = True
    for result in results:
        problems = result.failures()
        passed = not problems
        all_passed &= passed
        expected = "—" if result.case.max_ratio is not None else f"{result.expected_pct:.1f}%"
        delta = (
            "—"
            if result.case.max_ratio is not None
            else f"{result.detected_pct - result.expected_pct:+.1f}"
        )
        sources = f"{len(result.found_sources)}/{len(result.case.expected_sources)}"
        print(
            f"{result.case.name:<26}"
            f"{expected:>10}"
            f"{result.detected_pct:>9.1f}%"
            f"{delta:>9}"
            f"{sources:>7}"
            f"{result.elapsed_s:>7.2f}s"
            f"  {'PASS' if passed else 'FAIL — ' + '; '.join(problems)}",
        )

    print()
    print("What each case answers")
    print("-" * len(header))
    for result in results:
        print(f"  {result.case.name:<26} {result.case.question}")
        if result.case.note:
            print(f"  {'':<26}   ({result.case.note})")

    failed = [r for r in results if r.failures()]
    print()
    print(f"{len(results) - len(failed)}/{len(results)} cases match ground truth.")
    return all_passed


def compare_unverified(
    store: CorpusStore,
    config: ExactMatchConfig,
    results: list[Result],
    names: tuple[str, ...],
) -> list[tuple[str, float, float, float]]:
    """
    Re-run cases with verification off, the way a fingerprint-only source is scored.

    Text is retained only for Folio's own articles and the back catalogue; the OAI
    harvest is fingerprints plus a URL, so its runs are never checked against
    stored text and never trimmed to the exact token. Those runs come straight out
    of the merge step, which bridges gaps up to ``max_gap_tokens`` — so the figure
    they produce is an upper bound. This measures how loose that bound is, and it
    matters because fingerprint-only documents are the bulk of the corpus.
    """
    service = ExactMatchService(store, replace(config, verify_with_stored_text=False))
    rows: list[tuple[str, float, float, float]] = []
    for result in results:
        if result.case.name not in names:
            continue
        report = service.detect(result.case.text)
        rows.append(
            (
                result.case.name,
                result.expected_pct,
                result.detected_pct,
                round(report.overall_ratio * 100, 2),
            ),
        )
    return rows


def print_unverified(rows: list[tuple[str, float, float, float]], max_gap: int) -> None:
    if not rows:
        return
    print()
    print("Fingerprint-only sources (no stored text to verify against)")
    header = f"{'case':<26}{'truth':>9}{'verified':>10}{'unverified':>12}{'inflation':>11}"
    print(header)
    print("-" * len(header))
    for name, truth, verified, unverified in rows:
        print(
            f"{name:<26}{truth:>8.1f}%{verified:>9.1f}%{unverified:>11.1f}%"
            f"{unverified - verified:>+10.1f}",
        )
    print(
        "  Runs here come straight from the merge step, so a gap of up to\n"
        f"  {max_gap} tokens counts as matched. Read these as an upper bound.",
    )


def to_json(results: list[Result], docs: int, fingerprints: int) -> dict:
    return {
        "corpus": {"documents": docs, "fingerprints": fingerprints},
        "cases": [
            {
                "name": r.case.name,
                "question": r.case.question,
                "injected_percent": r.expected_pct,
                "reported_percent": r.detected_pct,
                "ceiling_percent": (
                    None if r.case.max_ratio is None else round(r.case.max_ratio * 100, 2)
                ),
                "total_tokens": r.report.total_tokens,
                "matched_tokens": r.report.matched_tokens,
                "quoted_tokens": r.report.quoted_tokens,
                "reference_tokens_skipped": r.report.reference_tokens_skipped,
                "expected_sources": sorted(r.case.expected_sources),
                "found_sources": sorted(r.found_sources),
                "false_positives": sorted(r.false_positive_sources),
                "elapsed_seconds": round(r.elapsed_s, 3),
                "failures": r.failures(),
            }
            for r in results
        ],
    }


# ------------------------------------------------------------------------ main


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--manuscript-tokens",
        type=int,
        default=DEFAULT_MANUSCRIPT_TOKENS,
        help=f"synthetic manuscript length (default {DEFAULT_MANUSCRIPT_TOKENS})",
    )
    parser.add_argument("--json", type=Path, help="also write the full report as JSON")
    parser.add_argument("--only", help="run only cases whose name contains this")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.WARNING,
        format="%(levelname)s %(name)s: %(message)s",
    )

    config = ExactMatchConfig()
    store = CorpusStore.open(db_config())
    try:
        docs, fingerprints = corpus_size(store)
        service = ExactMatchService(store, config)

        candidates = load_candidates(store, count=16)
        sources, rejected = select_clean_material(service, candidates, wanted=6)
        if len(sources) < 3:
            print(
                f"Need at least 3 corpus documents with retained text, "
                f">={MIN_SOURCE_TOKENS} tokens, and no overlap with the rest of the "
                f"corpus; found {len(sources)} of {len(candidates)} candidates.\n"
                "Run scripts/import_back_catalog.py first.",
                file=sys.stderr,
            )
            return 1

        print(f"Material: {len(sources)} screened documents")
        for source in sources[:3]:
            print(f"  {len(source.words):>6,} tokens  {source.short_title}")
        if rejected:
            print(
                f"Rejected {len(rejected)} candidate(s) that already overlap the corpus "
                "(compound scans or duplicate harvests, not matcher errors):",
            )
            for source, ratio, count, longest in rejected:
                print(
                    f"  {len(source.words):>6,} tokens  {ratio * 100:5.1f}% over "
                    f"{count:>2} doc(s), longest run {longest:>5} tok  {source.short_title}",
                )

        rng = random.Random(SEED)
        filler = Filler(sources, rng)
        cases = build_cases(sources, filler, args.manuscript_tokens, config)
        if args.only:
            cases = [c for c in cases if args.only in c.name]

        results: list[Result] = []
        for case in cases:
            started = time.perf_counter()
            report = service.detect(
                case.text,
                exclude_doc_ids=sorted(case.exclude_docs) or None,
            )
            results.append(
                Result(case=case, report=report, elapsed_s=time.perf_counter() - started),
            )

        passed = print_report(results, docs, fingerprints)
        print_unverified(
            compare_unverified(
                store,
                config,
                results,
                names=(
                    "clean",
                    "copied-10pct",
                    "copied-30pct",
                    "copied-80pct",
                    "copied-whole",
                    "paraphrase-every-10th",
                    "paraphrase-every-20th",
                ),
            ),
            config.max_gap_tokens,
        )
        if args.json:
            args.json.write_text(
                json.dumps(to_json(results, docs, fingerprints), ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            print(f"JSON written to {args.json}")
        return 0 if passed else 1
    finally:
        close_corpus_pool()


if __name__ == "__main__":
    raise SystemExit(main())
