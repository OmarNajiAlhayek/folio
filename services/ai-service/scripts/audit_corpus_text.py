"""Reassess stored corpus text and quarantine unreadable rows.

Fingerprints are the reachability edge. For every ``back_catalog`` row whose
stored text is now judged BROKEN:

1. delete all ``corpus_fingerprints`` for that doc
2. set ``retained_text = NULL`` (keep ``content_hash``)

Note: assessing original retained text (vs old space-joined normalized) can raise
SUSPECT counts via repeat-run heuristics on PDF leaders; BROKEN / quarantine
decisions are unchanged.

Re-importing the same broken PDF then hits ``skip_if_unchanged`` and stays
quarantined. A real OCR pass changes the hash and repairs the row.

Usage (from ``services/ai-service``)::

    python scripts/audit_corpus_text.py --dry-run
    python scripts/audit_corpus_text.py
    python scripts/audit_corpus_text.py --refresh-stoplist
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import get_settings  # noqa: E402
from app.ml.exact_match.corpus_store import CorpusStore  # noqa: E402
from app.ml.exact_match.exact_match_service import ExactMatchService  # noqa: E402
from app.ml.exact_match.text_quality import TextQuality, assess_text  # noqa: E402
from app.ml.exact_match.types import SourceKind  # noqa: E402
from app.ml.vector.pg_pool import VectorDbConfig  # noqa: E402

logger = logging.getLogger("audit_corpus_text")


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


def iter_text_rows(store: CorpusStore, source_kind: SourceKind):
    with store._pool.connection() as conn:  # noqa: SLF001 — audit script
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id::text, title, retained_text
                FROM corpus_documents
                WHERE source_kind = %s
                  AND retained_text IS NOT NULL
                ORDER BY indexed_at
                """,
                (str(source_kind),),
            )
            yield from cur


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Report counts only; do not quarantine",
    )
    parser.add_argument(
        "--refresh-stoplist",
        action="store_true",
        help="Rebuild corpus_common_hashes after quarantine",
    )
    parser.add_argument(
        "--source-kind",
        default="back_catalog",
        choices=[k.value for k in SourceKind],
        help="Which source_kind to audit (default: back_catalog)",
    )
    parser.add_argument("--verbose", action="store_true")
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(levelname)s %(name)s: %(message)s",
    )

    kind = SourceKind(args.source_kind)
    store = CorpusStore.open(db_config())
    counts = {"good": 0, "suspect": 0, "broken": 0, "too_short": 0, "quarantined": 0}
    try:
        for doc_id, title, text in iter_text_rows(store, kind):
            report = assess_text(text)
            counts[report.quality.value] += 1
            if report.quality is not TextQuality.BROKEN:
                continue
            logger.info(
                "BROKEN %s — %s (%s)",
                doc_id,
                (title or "")[:80],
                report.reason,
            )
            if args.dry_run:
                continue
            removed = store.quarantine_document(doc_id)
            counts["quarantined"] += 1
            logger.info("quarantined %s (%d fingerprints removed)", doc_id, removed)

        summary = ", ".join(f"{name}={count}" for name, count in counts.items())
        logger.info("Done: %s", summary)

        if args.refresh_stoplist and not args.dry_run:
            service = ExactMatchService(store)
            common = service.refresh_stoplist()
            logger.info("Stoplist rebuilt: %d common hashes", common)
            logger.info("Corpus stats: %s", store.stats())

        return 0
    finally:
        store.close()


if __name__ == "__main__":
    raise SystemExit(main())
