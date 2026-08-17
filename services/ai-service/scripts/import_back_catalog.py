"""Bulk-import a journal back catalogue into the exact-match corpus.

This is the highest-value corpus for a university journal: local authors copy from
local prior issues far more often than from anything an English open-access API
indexes, and the university already owns the text, so there is no licence
question and the full text can be stored for verification.

Usage (from ``services/ai-service`` with ``.[similarity]`` installed)::

    python scripts/import_back_catalog.py ../../Damascus_Articles
    python scripts/import_back_catalog.py <dir> --category "الهندسة" --year 2019
    python scripts/import_back_catalog.py <dir> --dry-run          # extract only
    python scripts/import_back_catalog.py --refresh-stoplist-only  # after imports

Re-running is safe and cheap: a document whose normalized text is unchanged is
skipped without re-fingerprinting.
"""

from __future__ import annotations

import argparse
import logging
import sys
from fnmatch import fnmatch
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import get_settings  # noqa: E402
from app.ml.exact_match.corpus_store import CorpusStore  # noqa: E402
from app.ml.exact_match.exact_match_service import ExactMatchService  # noqa: E402
from app.ml.exact_match.ocr import recover_text  # noqa: E402
from app.ml.exact_match.text_extract import (  # noqa: E402
    SUPPORTED_SUFFIXES,
    TextExtractionError,
    extract_text,
    extraction_warnings,
)
from app.ml.exact_match.text_quality import TextQuality, assess_text  # noqa: E402
from app.ml.exact_match.types import CorpusDocument, SourceKind  # noqa: E402
from app.ml.vector.pg_pool import VectorDbConfig  # noqa: E402

logger = logging.getLogger("import_back_catalog")

# Below this a "document" is a cover page or an errata note, not an article.
MIN_TOKENS = 200


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


# The journal's own submission template must never enter the corpus: every author
# starts from it, so indexing it makes every future submission match it verbatim.
DEFAULT_EXCLUDES = ("قالب*", "template*", "~$*")


def discover_files(root: Path, excludes: tuple[str, ...] = DEFAULT_EXCLUDES) -> list[Path]:
    candidates = [root] if root.is_file() else sorted(root.rglob("*"))
    return [
        path
        for path in candidates
        if path.is_file()
        and path.suffix.lower() in SUPPORTED_SUFFIXES
        and not any(fnmatch(path.name, pattern) for pattern in excludes)
    ]


# Every article opens with the same masthead block — journal name, volume and
# issue, page range, ISSN, portal URL — before the actual title. Taking the first
# substantial line therefore titles half the corpus "مجلة جامعة دمشق للعلوم …",
# which tells an editor nothing about *which* article was copied.
_MASTHEAD_MARKERS = (
    "مجلة جامعة",
    "مجمة جامعة",  # the same words via a PDF whose encoding maps ل to م
    "جامعة دمشق ل",
    "damascus university journal",
    "damascus university",
    "issn",
    "http",
    "@",
    "vol ",
    "vol.",
    " no.",
    "المجلد",
    "المجمد",
    "العدد",
    # Journal names that appear split across lines, so the generic markers above
    # miss the tail fragment ("… for seismology" / "Disaster Research").
    "seismology",
    "disaster research",
    "الزلازل والكوارث",
    "الزالزل والكوارث",
)

# A masthead fragment that dodges the marker list is almost always short —
# "Disaster Research", "الزالزل والكوارث" — whereas real titles in this corpus
# run 39-71 characters. Requiring 30 rejects the fragments without discarding
# any observed title. The looser floor still applies to the fallback below, so a
# short-titled article keeps something rather than falling through to a filename.
_MIN_TITLE_CHARS = 30


def _is_masthead(line: str) -> bool:
    lowered = line.lower()
    if any(marker in lowered for marker in _MASTHEAD_MARKERS):
        return True
    # Volume/page runs like "41 1 2025 109 127" carry no letters worth keeping.
    letters = sum(1 for ch in line if ch.isalpha())
    return letters < len(line) / 2


def derive_title(path: Path, text: str) -> str:
    """
    Best-effort article title: the first substantial line that is not masthead.

    Falls back to the old first-substantial-line rule when everything looks like
    masthead, and to the filename when there is no usable line at all — a wrong
    title is still better than an empty one, since the editor also gets the
    matched snippet.
    """
    candidates = [line.strip() for line in text.splitlines()]
    candidates = [line for line in candidates if 15 <= len(line) <= 200]

    for candidate in candidates:
        if len(candidate) >= _MIN_TITLE_CHARS and not _is_masthead(candidate):
            return candidate
    return candidates[0] if candidates else path.stem


def import_file(
    service: ExactMatchService | None,
    path: Path,
    root: Path,
    *,
    category: str,
    language: str,
    year: int | None,
    dry_run: bool,
    ocr: bool = False,
    allow_suspect: bool = False,
) -> tuple[str, str]:
    """Import one file. Returns ``(outcome, detail)`` for the run summary."""
    try:
        extracted = extract_text(path)
    except TextExtractionError as exc:
        return "failed", str(exc)

    for warning in extraction_warnings(extracted):
        logger.warning("%s: %s", path.name, warning)

    # Guard against silently-broken extraction. An Arabic PDF with a broken font
    # encoding yields valid Arabic code points that spell nothing: it indexes
    # happily and then never matches anything. Reject it rather than pretend.
    quality = assess_text(extracted.text)
    if quality.quality is TextQuality.BROKEN and ocr and path.suffix.lower() == ".pdf":
        extracted, how = recover_text(path.read_bytes(), extracted)
        quality = assess_text(extracted.text)
        logger.info("%s: OCR fallback -> %s (%s)", path.name, how, quality.quality)

    # Fingerprints are the reachability edge — never index unreadable or merely
    # suspect text. SUSPECT needs a human spot-check (--allow-suspect).
    if quality.quality is TextQuality.BROKEN:
        return "broken_text", f"{quality.reason} [{extracted.extractor}]"
    if quality.quality is TextQuality.SUSPECT and not allow_suspect:
        return "suspect_text", f"{quality.reason} [{extracted.extractor}]"

    if dry_run or service is None:
        note = f"{extracted.char_count} chars via {extracted.extractor} [{quality.quality}]"
        if quality.quality is TextQuality.SUSPECT:
            note += f" — {quality.reason}"
        return "extracted", note

    try:
        source_ref = str(path.relative_to(root))
    except ValueError:
        source_ref = path.name

    document = CorpusDocument(
        source_kind=SourceKind.BACK_CATALOG,
        source_ref=source_ref,
        title=derive_title(path, extracted.text),
        language=language,
        category=category,
        published_year=year,
        license="journal-owned",
    )
    result = service.index_document(document, extracted.text)

    if result.unchanged:
        return "unchanged", result.doc_id
    if result.token_count < MIN_TOKENS:
        return "too_short", f"{result.token_count} tokens (< {MIN_TOKENS})"
    return "indexed", f"{result.token_count} tokens, {result.fingerprint_count} fingerprints"


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "directory",
        nargs="?",
        type=Path,
        help="Folder of PDF/DOCX/TXT articles (searched recursively)",
    )
    parser.add_argument("--category", default="", help="Discipline label for every file")
    parser.add_argument("--language", default="ar", help="Language tag (default: ar)")
    parser.add_argument("--year", type=int, default=None, help="Publication year for every file")
    parser.add_argument("--limit", type=int, default=0, help="Import at most N files")
    parser.add_argument(
        "--exclude",
        action="append",
        default=None,
        metavar="GLOB",
        help=f"Filename glob to skip; repeatable. Defaults to {' '.join(DEFAULT_EXCLUDES)}",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Extract and report quality only; write nothing",
    )
    parser.add_argument(
        "--refresh-stoplist-only",
        action="store_true",
        help="Skip importing; just rebuild the boilerplate stoplist",
    )
    parser.add_argument(
        "--ocr",
        action="store_true",
        help="OCR PDFs whose text layer is broken (~2s/page, needs Tesseract + ara)",
    )
    parser.add_argument(
        "--allow-suspect",
        action="store_true",
        help="Index SUSPECT text (default: reject — spot-check first)",
    )
    parser.add_argument("--verbose", action="store_true")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(levelname)s %(name)s: %(message)s",
    )

    # --dry-run only extracts text, so it must not require a reachable database.
    store = None if args.dry_run else CorpusStore.open(db_config())
    service = ExactMatchService(store) if store is not None else None

    try:
        if args.refresh_stoplist_only:
            if service is None:
                logger.error("--refresh-stoplist-only cannot be combined with --dry-run")
                return 2
            count = service.refresh_stoplist()
            logger.info("Stoplist rebuilt: %d common hashes", count)
            return 0

        if args.directory is None:
            logger.error("A directory is required unless --refresh-stoplist-only is passed")
            return 2

        root = args.directory.resolve()
        if not root.exists():
            logger.error("No such path: %s", root)
            return 2

        excludes = tuple(args.exclude) if args.exclude else DEFAULT_EXCLUDES
        files = discover_files(root, excludes)
        if args.limit:
            files = files[: args.limit]
        if not files:
            logger.error("No %s files under %s", "/".join(sorted(SUPPORTED_SUFFIXES)), root)
            return 1

        logger.info("Importing %d file(s) from %s", len(files), root)
        outcomes: dict[str, int] = {}
        for path in files:
            outcome, detail = import_file(
                service,
                path,
                root,
                category=args.category,
                language=args.language,
                year=args.year,
                dry_run=args.dry_run,
                ocr=args.ocr,
                allow_suspect=args.allow_suspect,
            )
            outcomes[outcome] = outcomes.get(outcome, 0) + 1
            level = logging.ERROR if outcome == "failed" else logging.INFO
            logger.log(level, "%-10s %s — %s", outcome, path.name, detail)

        summary = ", ".join(f"{count} {name}" for name, count in sorted(outcomes.items()))
        logger.info("Done: %s", summary)

        if service is not None and store is not None:
            common = service.refresh_stoplist()
            logger.info("Stoplist rebuilt: %d common hashes", common)
            logger.info("Corpus stats: %s", store.stats())

        return 1 if outcomes.get("failed") else 0
    finally:
        if store is not None:
            store.close()


if __name__ == "__main__":
    raise SystemExit(main())
