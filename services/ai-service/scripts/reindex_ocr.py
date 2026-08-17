"""Resumable OCR reindex for broken / quarantined Damascus PDFs.

Checkpoint key is the **file SHA-1**, not ``source_ref`` (folder renames must
not redo a multi-hour run). OCR page cap defaults to 40.

Usage (from ``services/ai-service``)::

    python scripts/reindex_ocr.py "C:/Users/ASUS ROG/Documents/all data min version" --dry-run
    python scripts/reindex_ocr.py <dir> --ocr-max-pages 40
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# Reuse discovery/title helpers from the back-catalog importer without treating
# ``scripts`` as a package.
import import_back_catalog as _back  # noqa: E402

from app.config import get_settings  # noqa: E402
from app.ml.exact_match.corpus_store import CorpusStore  # noqa: E402
from app.ml.exact_match.exact_match_service import ExactMatchService  # noqa: E402
from app.ml.exact_match.ocr import available_engines, recover_text  # noqa: E402
from app.ml.exact_match.text_extract import (  # noqa: E402
    TextExtractionError,
    extract_text,
)
from app.ml.exact_match.text_quality import TextQuality, assess_text  # noqa: E402
from app.ml.exact_match.types import CorpusDocument, SourceKind  # noqa: E402
from app.ml.vector.pg_pool import VectorDbConfig  # noqa: E402

logger = logging.getLogger("reindex_ocr")

DEFAULT_OCR_MAX_PAGES = 40


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


def file_sha1(path: Path) -> str:
    h = hashlib.sha1()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def load_checkpoint(path: Path) -> set[str]:
    if not path.exists():
        return set()
    data = json.loads(path.read_text(encoding="utf-8"))
    return set(data.get("done_sha1", []))


def save_checkpoint(path: Path, done: set[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps({"done_sha1": sorted(done)}, indent=2),
        encoding="utf-8",
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("directory", type=Path, help="Root of PDF/DOCX articles")
    parser.add_argument("--category", default="")
    parser.add_argument("--language", default="ar")
    parser.add_argument("--year", type=int, default=None)
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--ocr-max-pages", type=int, default=DEFAULT_OCR_MAX_PAGES)
    parser.add_argument(
        "--engine",
        default="",
        help=(
            "OCR engine by name (mistral, surya, tesseract). Defaults to the "
            "best one available. 'mistral' is hosted and billed per page."
        ),
    )
    parser.add_argument(
        "--always-ocr",
        action="store_true",
        help=(
            "OCR every PDF, not just the broken ones. Costs a full OCR pass over "
            "the corpus and buys recall: matching compares a submission against "
            "the corpus, so a corpus extracted two different ways loses matches "
            "at the seam. Pair with the same engine on the submission side."
        ),
    )
    parser.add_argument(
        "--checkpoint",
        type=Path,
        default=Path("scripts/.reindex_ocr_checkpoint.json"),
    )
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--verbose", action="store_true")
    parser.add_argument(
        "--skip-ocr",
        action="store_true",
        help=(
            "Do not OCR broken PDFs — only reindex extracts that are already "
            "GOOD (use to refresh retained_text after storage-semantics changes)"
        ),
    )
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(levelname)s %(name)s: %(message)s",
    )

    root = args.directory.resolve()
    if not root.exists():
        logger.error("No such path: %s", root)
        return 2

    engine = None
    if args.engine:
        engine = next((e for e in available_engines() if e.name == args.engine), None)
        if engine is None:
            logger.error(
                "Unknown or unavailable OCR engine %r. Available: %s",
                args.engine,
                ", ".join(e.name for e in available_engines()) or "none",
            )
            return 2
        logger.info("OCR engine: %s", engine.name)

    files = _back.discover_files(root, _back.DEFAULT_EXCLUDES)
    if args.limit:
        files = files[: args.limit]

    done = load_checkpoint(args.checkpoint)
    store = None if args.dry_run else CorpusStore.open(db_config())
    service = ExactMatchService(store) if store is not None else None
    outcomes: dict[str, int] = {}

    try:
        for path in files:
            digest = file_sha1(path)
            if digest in done:
                outcomes["skipped_checkpoint"] = outcomes.get("skipped_checkpoint", 0) + 1
                continue

            try:
                extracted = extract_text(path)
            except TextExtractionError as exc:
                outcomes["failed"] = outcomes.get("failed", 0) + 1
                logger.error("failed %s — %s", path.name, exc)
                done.add(digest)
                save_checkpoint(args.checkpoint, done)
                continue

            quality = assess_text(extracted.text)
            if (
                not args.skip_ocr
                and (args.always_ocr or quality.quality is TextQuality.BROKEN)
                and path.suffix.lower() == ".pdf"
            ):
                extracted, how = recover_text(
                    path.read_bytes(),
                    extracted,
                    engine=engine,
                    max_pages=args.ocr_max_pages or None,
                    force=args.always_ocr,
                )
                quality = assess_text(extracted.text)
                logger.info("%s: OCR -> %s (%s)", path.name, how, quality.quality)

            if not quality.indexable:
                outcomes[quality.quality.value] = outcomes.get(quality.quality.value, 0) + 1
                done.add(digest)
                save_checkpoint(args.checkpoint, done)
                continue

            if service is None:
                outcomes["would_index"] = outcomes.get("would_index", 0) + 1
                done.add(digest)
                save_checkpoint(args.checkpoint, done)
                continue

            try:
                source_ref = str(path.relative_to(root))
            except ValueError:
                source_ref = path.name

            document = CorpusDocument(
                source_kind=SourceKind.BACK_CATALOG,
                source_ref=source_ref,
                title=_back.derive_title(path, extracted.text),
                language=args.language,
                category=args.category,
                published_year=args.year,
                license="journal-owned",
            )
            # Force re-fingerprint when OCR repaired a previously quarantined hash.
            result = service.index_document(document, extracted.text, skip_if_unchanged=False)
            outcomes["indexed"] = outcomes.get("indexed", 0) + 1
            logger.info(
                "indexed %s — %d tokens (%s)",
                path.name,
                result.token_count,
                document.title[:60],
            )
            done.add(digest)
            save_checkpoint(args.checkpoint, done)

        summary = ", ".join(f"{k}={v}" for k, v in sorted(outcomes.items()))
        logger.info("Done: %s", summary)
        if service is not None and store is not None:
            common = service.refresh_stoplist()
            logger.info("Stoplist rebuilt: %d common hashes", common)
        return 0
    finally:
        if store is not None:
            store.close()


if __name__ == "__main__":
    raise SystemExit(main())
