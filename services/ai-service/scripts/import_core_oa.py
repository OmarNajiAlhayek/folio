"""Import open-access full text from CORE into the exact-match corpus (Tier 2).

Fingerprints only — the text is never stored. That keeps the import legally
uncomplicated regardless of each repository's licence, and keeps the table small:
a 6000-word paper costs roughly 1300 fingerprint rows and no text.

Usage (from ``services/ai-service``)::

    export CORE_API_KEY=...
    python scripts/import_core_oa.py --query '"structural engineering"' --limit 500
    python scripts/import_core_oa.py --query 'seismic retrofit' --language ar --limit 200

Coverage is overwhelmingly English. This tier supplements the Damascus back
catalogue and the web check; for Arabic manuscripts those two do the real work.
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import get_settings  # noqa: E402
from app.ml.exact_match.corpus_store import CorpusStore  # noqa: E402
from app.ml.exact_match.exact_match_service import ExactMatchService  # noqa: E402
from app.ml.exact_match.sources.core import CoreApiClient, CoreApiError  # noqa: E402
from app.ml.exact_match.types import CorpusDocument, SourceKind  # noqa: E402
from app.ml.vector.pg_pool import VectorDbConfig  # noqa: E402

logger = logging.getLogger("import_core_oa")

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


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--query", required=True, help="CORE search query (Lucene syntax)")
    parser.add_argument("--limit", type=int, default=200, help="Maximum works to import")
    parser.add_argument("--language", default=None, help="Restrict to a language code, e.g. ar")
    parser.add_argument("--category", default="", help="Discipline label to tag imports with")
    parser.add_argument("--page-size", type=int, default=50)
    parser.add_argument("--sleep", type=float, default=1.0, help="Seconds between API pages")
    parser.add_argument(
        "--api-key",
        default=os.environ.get("CORE_API_KEY", ""),
        help="CORE API key (defaults to $CORE_API_KEY)",
    )
    parser.add_argument("--verbose", action="store_true")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(levelname)s %(name)s: %(message)s",
    )

    try:
        client = CoreApiClient(
            args.api_key,
            sleep_between_pages=args.sleep,
        )
    except CoreApiError as exc:
        logger.error("%s", exc)
        return 2

    store = CorpusStore.open(db_config())
    service = ExactMatchService(store)
    indexed = skipped = unchanged = 0

    try:
        for work in client.search(
            args.query,
            limit=args.limit,
            page_size=args.page_size,
            language=args.language,
        ):
            document = CorpusDocument(
                source_kind=SourceKind.EXTERNAL_OA,
                source_ref=work.source_ref,
                title=work.title,
                authors=work.authors,
                language=work.language,
                category=args.category,
                published_year=work.year,
                source_url=work.download_url,
                license="open-access (see source)",
            )
            # store_text=False is the whole point of this tier: one-way
            # fingerprints redistribute nothing.
            result = service.index_document(document, work.full_text, store_text=False)
            if result.unchanged:
                unchanged += 1
                continue
            if result.token_count < MIN_TOKENS:
                skipped += 1
                logger.debug(
                    "Skipped short work %s (%d tokens)",
                    work.source_ref,
                    result.token_count,
                )
                continue
            indexed += 1
            logger.info(
                "indexed  %s — %d tokens, %d fingerprints",
                work.source_ref,
                result.token_count,
                result.fingerprint_count,
            )

        logger.info("Done: %d indexed, %d unchanged, %d too short", indexed, unchanged, skipped)
        common = service.refresh_stoplist()
        logger.info("Stoplist rebuilt: %d common hashes", common)
        logger.info("Corpus stats: %s", store.stats())
        return 0
    except CoreApiError as exc:
        logger.error("%s", exc)
        return 1
    finally:
        store.close()


if __name__ == "__main__":
    raise SystemExit(main())
