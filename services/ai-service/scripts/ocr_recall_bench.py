"""Measure what OCR costs us in *detection*, not in readability.

``ocr_bench.py`` answers "is this text readable?" with a function-word ratio.
That is necessary but not sufficient: exact matching needs whole k-grams, so at
k=6 one wrong or merged word destroys up to six fingerprints. Text can read
perfectly to a human and still match badly.

This measures the thing that actually matters. For an article whose text layer is
GOOD (so we have ground truth), it:

1. OCRs the PDF and indexes *that* as the corpus copy of the article
2. submits the clean text layer of the same article, as a perfect verbatim copy
3. reports ``overall_ratio``

That ratio is recall: the share of a word-for-word plagiarist we would still
catch if the article had entered the corpus through OCR. It runs through the real
:class:`ExactMatchService` — real winnowing, run-merging, and verification. Only
storage is in-memory, so no demo corpus is touched.

Two controls make the number readable:

* clean-vs-clean should be ~1.00 — proves the harness detects at all
* article A against a corpus holding only article B should be 0.00 — proves it
  is not matching boilerplate or noise

Usage::

    python scripts/ocr_recall_bench.py ../../Damascus_Articles
    python scripts/ocr_recall_bench.py <dir> --engines mistral,tesseract --limit 3
"""

from __future__ import annotations

import argparse
import logging
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.ml.exact_match.corpus_store import (  # noqa: E402
    IndexResult,
    Posting,
    StoredDocument,
)
from app.ml.exact_match.exact_match_service import ExactMatchService  # noqa: E402
from app.ml.exact_match.ocr import available_engines, ocr_pdf_bytes  # noqa: E402
from app.ml.exact_match.text_extract import extract_pdf_bytes  # noqa: E402
from app.ml.exact_match.text_quality import TextQuality, assess_text  # noqa: E402
from app.ml.exact_match.types import CorpusDocument, SourceKind  # noqa: E402

logger = logging.getLogger("ocr_recall_bench")


class MemoryStore:
    """
    In-memory stand-in for :class:`CorpusStore`.

    Deliberately not the Postgres store: this indexes throwaway documents, and
    doing that against the demo corpus would leave test rows behind. Matching
    logic is unaffected — the store only persists and retrieves; every
    fingerprint, run-merge and verification decision lives in ExactMatchService.
    """

    def __init__(self) -> None:
        self._docs: dict[str, StoredDocument] = {}
        self._postings: list[Posting] = []
        self._common: set[int] = set()
        self._next_id = 1

    def upsert_document(
        self,
        document: CorpusDocument,
        *,
        fingerprints: list[tuple[int, int]],
        token_count: int,
        retained_text: str | None,
        content_hash: str,
        skip_if_unchanged: bool = True,
    ) -> IndexResult:
        doc_id = f"doc-{self._next_id}"
        self._next_id += 1
        self._docs[doc_id] = StoredDocument(
            doc_id=doc_id,
            source_kind=document.source_kind,
            source_ref=document.source_ref,
            title=document.title,
            source_url=document.source_url,
            submission_id=document.submission_id,
            token_count=token_count,
            retained_text=retained_text,
            content_hash=content_hash,
        )
        self._postings.extend(
            Posting(doc_id=doc_id, hash=hash_value, word_pos=word_pos)
            for hash_value, word_pos in fingerprints
        )
        return IndexResult(
            doc_id=doc_id,
            token_count=token_count,
            fingerprint_count=len(fingerprints),
        )

    def query_postings(
        self,
        hashes: list[int],
        *,
        max_postings_per_hash: int,
        exclude_doc_ids: list[str] | None = None,
        exclude_submission_ids: list[str] | None = None,
        source_kinds: list[SourceKind] | None = None,
    ) -> list[Posting]:
        wanted = set(hashes) - self._common
        excluded = set(exclude_doc_ids or ())
        return [
            posting
            for posting in self._postings
            if posting.hash in wanted and posting.doc_id not in excluded
        ]

    def get_documents(self, doc_ids: list[str], *, with_text: bool) -> dict[str, StoredDocument]:
        return {doc_id: self._docs[doc_id] for doc_id in doc_ids if doc_id in self._docs}

    def filter_common_hashes(self, hashes: list[int]) -> set[int]:
        return {hash_value for hash_value in hashes if hash_value in self._common}

    def refresh_common_hashes(self, *, doc_ratio: float, min_docs: int, min_doc_freq: int) -> int:
        """
        Mirror the real stoplist rule, including its floor.

        Stubbing this out would quietly flatter every measurement: journal
        boilerplate (the copyright block, the running header) sits in every
        article and matches every submission, so without suppression a bench
        reports overlap that a production corpus would have discarded.
        """
        if len(self._docs) < min_docs:
            self._common = set()
            return 0
        threshold = max(min_doc_freq, round(len(self._docs) * doc_ratio))
        docs_per_hash: dict[int, set[str]] = {}
        for posting in self._postings:
            docs_per_hash.setdefault(posting.hash, set()).add(posting.doc_id)
        self._common = {
            hash_value for hash_value, docs in docs_per_hash.items() if len(docs) >= threshold
        }
        return len(self._common)


# A reference is only usable while it is better than what it is judging. Below
# this share of the best engine's lexicon ratio, the text layer is the more
# corrupt of the two and the "recall" it produces measures the reference's decay
# rather than the engine's accuracy. The gap is not a close call in practice:
# healthy references here score 0.91-0.92 of their OCR, a corrupt one 0.49.
GROUND_TRUTH_LEXICON_FLOOR = 0.75


def ground_truth_is_trustworthy(reference: str, ocr_texts: list[str]) -> tuple[bool, float]:
    """
    Decide whether a text layer is sound enough to score OCR against.

    Returns ``(trustworthy, ratio)`` where ratio is the reference's real-word
    density as a share of the best OCR pass. A ratio near 1.0 means both sides
    read the same language; well below it means the PDF's own text layer is
    decaying (a broken ToUnicode CMap substituting letters), and scoring against
    it would report an engine failure that is really a reference failure.
    """
    best_ocr = max((assess_text(text).lexicon_ratio for text in ocr_texts), default=0.0)
    if best_ocr <= 0.0:
        return True, 1.0
    ratio = assess_text(reference).lexicon_ratio / best_ocr
    return ratio >= GROUND_TRUTH_LEXICON_FLOOR, ratio


def index_and_detect(corpus_text: str, submission_text: str, *, ref: str) -> float:
    """Index one document, submit one text, return the overall match ratio."""
    service = ExactMatchService(MemoryStore())
    service.index_document(
        CorpusDocument(
            source_kind=SourceKind.BACK_CATALOG,
            source_ref=ref,
            title=ref,
            language="ar",
        ),
        corpus_text,
    )
    return service.detect(submission_text).overall_ratio


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("target", type=Path, help="Directory of PDFs")
    parser.add_argument(
        "--engines",
        default="",
        help="Comma-separated subset, e.g. mistral,tesseract",
    )
    parser.add_argument(
        "--reference",
        choices=("text-layer", "mistral"),
        default="text-layer",
        help=(
            "What counts as ground truth. 'text-layer' is independent of every "
            "engine but decays with the PDF; 'mistral' is the better text on "
            "this corpus but shares a pipeline with the engine under test."
        ),
    )
    parser.add_argument("--limit", type=int, default=5, help="GOOD files to measure")
    # Ground truth is the whole article, so OCR-ing only part of it caps recall
    # at the fraction of pages covered and the result reads like an engine
    # failure. Default to the whole document; the pg column shows the coverage.
    parser.add_argument("--max-pages", type=int, default=0, help="0 = whole document")
    parser.add_argument("--dpi", type=int, default=300)
    parser.add_argument("--lang", default="ara+eng")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(message)s")

    engines = available_engines()
    if args.engines:
        wanted = {name.strip() for name in args.engines.split(",") if name.strip()}
        engines = [engine for engine in engines if engine.name in wanted]
    if not engines:
        logger.error("No OCR engine selected/installed.")
        return 1

    reference_engine = None
    if args.reference == "mistral":
        reference_engine = next((e for e in available_engines() if e.name == "mistral"), None)
        if reference_engine is None:
            logger.error("--reference mistral needs MISTRAL_API_KEY set")
            return 1

    truths: list[tuple[Path, bytes, str]] = []
    for path in sorted(p for p in args.target.rglob("*.pdf") if p.is_file()):
        if len(truths) >= args.limit:
            break
        data = path.read_bytes()
        try:
            extracted = extract_pdf_bytes(data)
        except Exception as exc:  # noqa: BLE001 - bench script
            logger.info("skip %s (%s)", path.name, exc)
            continue

        if reference_engine is not None:
            # Every article is fair game: the point of an OCR reference is that
            # it does not depend on the PDF carrying a usable text layer.
            try:
                truths.append(
                    (path, data, ocr_pdf_bytes(data, engine=reference_engine).text),
                )
            except Exception as exc:  # noqa: BLE001 - bench script
                logger.info("skip %s (reference OCR failed: %s)", path.name, exc)
        elif assess_text(extracted.text).quality is TextQuality.GOOD:
            truths.append((path, data, extracted.text))

    if not truths:
        logger.error("No GOOD-text-layer PDFs under %s — no ground truth available", args.target)
        return 1

    logger.info("Engines: %s", ", ".join(e.name for e in engines))
    logger.info("Reference: %s (%d articles)\n", args.reference, len(truths))
    logger.info("RECALL = share of a verbatim copy still caught when the corpus")
    logger.info("         copy of that article came from OCR.")
    if args.reference == "mistral":
        logger.info("NOTE: reference and engine share a pipeline — mistral scores")
        logger.info("      itself here, so read it as self-consistency, not accuracy.")
    else:
        logger.info(
            "trust = reference real-word density / best OCR. Below %.2f the",
            GROUND_TRUTH_LEXICON_FLOOR,
        )
        logger.info("        text layer is the more corrupt side and the row is void (*).")
    logger.info("")

    header = f"{'article':<26}{'pg':>4}{'trust':>7}{'self':>7}{'other':>7}" + "".join(
        f"{e.name + ' rec':>14}{'qual':>7}" for e in engines
    )
    logger.info(header)
    logger.info("-" * len(header))

    recalls: dict[str, list[float]] = {e.name: [] for e in engines}
    pace: dict[str, list[float]] = {e.name: [] for e in engines}
    excluded: list[tuple[str, float]] = []

    for index, (path, data, truth) in enumerate(truths):
        # Control 1: the harness must find a document inside itself.
        self_ratio = index_and_detect(truth, truth, ref=path.name)
        # Control 2: a different article must not match at all.
        other_truth = truths[(index + 1) % len(truths)][2]
        other_ratio = index_and_detect(other_truth, truth, ref="other")

        cells: list[str] = []
        pages_seen = 0
        measured: list[tuple[str, float, float]] = []
        ocr_texts: list[str] = []
        for engine in engines:
            try:
                started = time.time()
                result = ocr_pdf_bytes(
                    data,
                    engine=engine,
                    lang=args.lang,
                    dpi=args.dpi,
                    max_pages=args.max_pages or None,
                )
                pages_seen = max(pages_seen, result.page_count)
                elapsed = time.time() - started
                quality = assess_text(result.text)
                recall = index_and_detect(result.text, truth, ref=path.name)
                ocr_texts.append(result.text)
                measured.append((engine.name, recall, elapsed / max(1, result.page_count)))
                cells.append(f"{recall:>13.1%}{quality.function_word_ratio:>7.3f}")
            except Exception as exc:  # noqa: BLE001 - bench script
                cells.append(f"{'ERR ' + type(exc).__name__:>20}")
                logger.debug("engine %s failed on %s", engine.name, path.name, exc_info=True)

        # An OCR reference cannot be less trustworthy than the OCR it scores.
        if args.reference == "mistral":
            trusted, trust = True, 1.0
        else:
            trusted, trust = ground_truth_is_trustworthy(truth, ocr_texts)
        if trusted:
            for name, recall, seconds in measured:
                recalls[name].append(recall)
                pace[name].append(seconds)
        else:
            excluded.append((path.name, trust))

        mark = f"{trust:>6.2f}" + (" " if trusted else "*")
        logger.info(
            f"{path.name[:24]:<26}{pages_seen:>4}{mark}{self_ratio:>7.0%}{other_ratio:>7.0%}"
            + "".join(cells),
        )

    logger.info("-" * len(header))
    logger.info("\nMean recall:")
    for engine in engines:
        scores = recalls[engine.name]
        if not scores:
            logger.info("  %-10s no successful runs", engine.name)
            continue
        mean = sum(scores) / len(scores)
        seconds = sum(pace[engine.name]) / len(pace[engine.name])
        logger.info("  %-10s %.1f%%   %.1fs/page", engine.name, mean * 100, seconds)

    if excluded:
        logger.info("\nExcluded from the mean — reference more corrupt than the OCR:")
        for name, trust in excluded:
            logger.info("  %-34s trust %.2f", name[:32], trust)

    logger.info(
        "\nRead the controls first: 'self' near 100%% and 'other' at 0%% mean the\n"
        "harness works, so the engine columns are measuring OCR and nothing else.",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
