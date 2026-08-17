"""Harvest a journal archive over OAI-PMH into the exact-match corpus (Tier 2).

The Arabic-coverage tier. Regional journals overwhelmingly run OJS, every OJS
install exposes an OAI-PMH endpoint built for exactly this, and none of it
involves a search engine — so no bot detection, no quoted-phrase problem, no
per-site scraper.

Probe first (one command tells you whether a site is harvestable)::

    python scripts/import_oai_pmh.py https://journal.example.edu --probe
    python scripts/import_oai_pmh.py <base-oai-url> --list-sets

Then harvest::

    python scripts/import_oai_pmh.py <base-oai-url> --limit 200 --language ar
    python scripts/import_oai_pmh.py <base-oai-url> --set <spec> --category "الهندسة"
    python scripts/import_oai_pmh.py <base-oai-url> --from 2026-01-01   # incremental

Text is never retained for these documents — fingerprints plus a URL only. Full
text is fetched when the ladder in ``app.ml.exact_match.fulltext`` can reach it;
otherwise the abstract from the OAI record is indexed, which still clears the
match floor.
"""

from __future__ import annotations

import argparse
import logging
import sys
import time
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import get_settings  # noqa: E402
from app.ml.exact_match.corpus_store import CorpusStore  # noqa: E402
from app.ml.exact_match.exact_match_service import ExactMatchService  # noqa: E402
from app.ml.exact_match.fulltext import resolve_fulltext  # noqa: E402
from app.ml.exact_match.ocr import recover_text  # noqa: E402
from app.ml.exact_match.sources.oai_pmh import (  # noqa: E402
    DEFAULT_USER_AGENT,
    OaiPmhClient,
    OaiPmhError,
    OaiRecord,
    guess_oai_endpoints,
)
from app.ml.exact_match.text_quality import TextQuality, assess_text  # noqa: E402
from app.ml.exact_match.types import CorpusDocument, SourceKind  # noqa: E402
from app.ml.vector.pg_pool import VectorDbConfig  # noqa: E402

logger = logging.getLogger("import_oai_pmh")

MIN_TOKENS = 120


@dataclass
class Tally:
    seen: int = 0
    indexed: int = 0
    unchanged: int = 0
    too_short: int = 0
    no_text: int = 0
    rungs: dict[str, int] = None  # type: ignore[assignment]

    def __post_init__(self) -> None:
        self.rungs = {}

    def rung(self, name: str) -> None:
        self.rungs[name] = self.rungs.get(name, 0) + 1


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


def probe(target: str, *, timeout: int, sleep: float) -> int:
    """Try the formulaic OAI locations for a site and report which answers."""
    candidates = [target] if "/oai" in target else guess_oai_endpoints(target)
    logger.info("Probing %d candidate endpoint(s)", len(candidates))
    for candidate in candidates:
        try:
            identity = OaiPmhClient(
                candidate,
                timeout=timeout,
                sleep_between_requests=sleep,
            ).identify()
        except OaiPmhError as exc:
            logger.info("  no  %s — %s", candidate, str(exc)[:110])
            continue
        logger.info("  YES %s", candidate)
        logger.info("      repository : %s", identity.repository_name)
        logger.info("      protocol   : %s", identity.protocol_version)
        logger.info("      earliest   : %s", identity.earliest_datestamp)
        logger.info("      granularity: %s", identity.granularity)
        if identity.admin_emails:
            logger.info("      admin      : %s", ", ".join(identity.admin_emails))
        return 0
    logger.error("No OAI-PMH endpoint found. The site may not run OJS/DSpace.")
    return 1


def index_record(
    service: ExactMatchService,
    record: OaiRecord,
    *,
    session: object,
    category: str,
    unpaywall_email: str,
    fetch_fulltext: bool,
    timeout: int,
    tally: Tally,
    ocr: bool = False,
    ocr_max_pages: int | None = None,
) -> None:
    text = ""
    source_url = record.landing_url
    rung = "0-metadata-only"

    if fetch_fulltext and record.article_url:
        resolved = resolve_fulltext(
            record.article_url,
            session=session,
            doi=record.doi,
            unpaywall_email=unpaywall_email,
            timeout=timeout,
        )
        if resolved is None:
            rung = "x-no-fulltext-found"
        else:
            # Broken font encodings are common in Arabic PDFs; indexing one costs
            # storage and returns nothing, forever.
            best_text = resolved.text
            best_rung = resolved.rung
            quality = assess_text(best_text)

            if quality.quality is TextQuality.BROKEN and ocr and resolved.raw_pdf:
                # Re-read the same bytes as pixels. This is the only recovery that
                # generalizes: other institutions publish what they publish, and
                # every extractor fails together on a broken ToUnicode CMap.
                recovered, how = recover_text(resolved.raw_pdf, max_pages=ocr_max_pages)
                logger.debug("OCR %s for %s", how, record.source_ref)
                if how == "ocr":
                    best_text = recovered.text
                    best_rung = f"{resolved.rung}+ocr"
                    quality = assess_text(best_text)

            # Reject BROKEN and SUSPECT full text — fingerprints from either
            # still match, and SUSPECT Arabic is often letter-substituted
            # garbage that cleared the old function-word-only gate.
            if not quality.indexable:
                logger.debug(
                    "Rejected unreadable full text for %s: %s",
                    record.source_ref,
                    quality.reason,
                )
                rung = (
                    "x-broken-pdf"
                    if quality.quality is TextQuality.BROKEN
                    else "x-suspect-pdf"
                )
            else:
                text, source_url, rung = best_text, resolved.url, best_rung

    # Even with no full text the abstract is worth indexing — a few hundred words
    # is well above the match floor. The rung still records *why* we are here, so
    # the run summary distinguishes "no PDF offered" from "PDF unreadable".
    if len(text) < 400 and record.description:
        text = f"{record.title}\n\n{record.description}"
        rung = f"{rung} -> abstract" if rung.startswith("x-") else "6-abstract-only"

    # Exactly one rung per record, so the tally sums to the record count.
    tally.rung(rung)
    if not text.strip():
        tally.no_text += 1
        return

    document = CorpusDocument(
        source_kind=SourceKind.EXTERNAL_OA,
        source_ref=record.source_ref,
        title=record.title,
        authors=record.authors,
        language=record.language,
        category=category,
        published_year=record.year,
        source_url=source_url or record.landing_url,
        license="open access via OAI-PMH",
    )
    # store_text=False: these are not ours to retain.
    result = service.index_document(document, text, store_text=False)

    if result.unchanged:
        tally.unchanged += 1
    elif result.token_count < MIN_TOKENS:
        tally.too_short += 1
    else:
        tally.indexed += 1
        logger.info(
            "indexed  [%-18s] %-58s %d tokens",
            rung,
            (record.title or record.source_ref)[:58],
            result.token_count,
        )


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("base_url", help="OAI base URL, or a site URL when using --probe")
    parser.add_argument("--probe", action="store_true", help="Find and describe the endpoint only")
    parser.add_argument("--list-sets", action="store_true", help="List sets (OJS: journals)")
    parser.add_argument("--set", dest="set_spec", default=None)
    parser.add_argument("--from", dest="from_date", default=None, help="YYYY-MM-DD, incremental")
    parser.add_argument("--until", dest="until_date", default=None)
    parser.add_argument("--limit", type=int, default=200)
    parser.add_argument("--language", default=None, help="Keep only this dc:language prefix")
    parser.add_argument("--category", default="", help="Discipline label for imports")
    parser.add_argument("--metadata-prefix", default="oai_dc")
    parser.add_argument("--sleep", type=float, default=1.0, help="Seconds between requests")
    parser.add_argument("--timeout", type=int, default=45)
    parser.add_argument(
        "--no-fulltext",
        action="store_true",
        help="Index abstracts only; never fetch PDFs",
    )
    parser.add_argument(
        "--unpaywall-email",
        default="",
        help="Enables the Unpaywall rung of the full-text ladder",
    )
    parser.add_argument("--user-agent", default=DEFAULT_USER_AGENT)
    parser.add_argument("--dry-run", action="store_true", help="Harvest and report; write nothing")
    parser.add_argument(
        "--ocr",
        action="store_true",
        help="OCR PDFs whose text layer is broken instead of falling back to the abstract",
    )
    parser.add_argument(
        "--ocr-max-pages",
        type=int,
        default=40,
        help=(
            "Cap OCR at N pages per article (0 = whole document). At ~2.3s/page an "
            "uncapped run is days; the opening pages carry abstract, introduction "
            "and methods, which is where copying concentrates."
        ),
    )
    parser.add_argument("--verbose", action="store_true")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(levelname)s %(name)s: %(message)s",
    )

    if args.probe:
        return probe(args.base_url, timeout=args.timeout, sleep=args.sleep)

    client = OaiPmhClient(
        args.base_url,
        timeout=args.timeout,
        sleep_between_requests=args.sleep,
        user_agent=args.user_agent,
    )

    try:
        if args.list_sets:
            sets = client.list_sets()
            logger.info("%d set(s)", len(sets))
            for spec, name in sets:
                logger.info("  %-45s %s", spec, name)
            return 0

        identity = client.identify()
        logger.info("Harvesting %s (%s)", identity.repository_name, identity.base_url)
    except OaiPmhError as exc:
        logger.error("%s", exc)
        return 1

    store = None if args.dry_run else CorpusStore.open(db_config())
    service = ExactMatchService(store) if store is not None else None
    import requests

    session = requests.Session()
    session.headers.update({"User-Agent": args.user_agent})

    tally = Tally()
    started = time.monotonic()

    try:
        for record in client.list_records(
            metadata_prefix=args.metadata_prefix,
            set_spec=args.set_spec,
            from_date=args.from_date,
            until_date=args.until_date,
            limit=args.limit,
        ):
            tally.seen += 1
            if args.language and not record.language.lower().startswith(args.language.lower()):
                continue
            if service is None:
                logger.info(
                    "  %-70s doi=%s url=%s",
                    (record.title or record.identifier)[:70],
                    record.doi or "-",
                    record.landing_url[:60] or "-",
                )
                continue
            index_record(
                service,
                record,
                session=session,
                category=args.category,
                unpaywall_email=args.unpaywall_email,
                fetch_fulltext=not args.no_fulltext,
                timeout=args.timeout,
                tally=tally,
                ocr=args.ocr,
                ocr_max_pages=args.ocr_max_pages or None,
            )
    except OaiPmhError as exc:
        logger.error("Harvest stopped: %s", exc)
        return 1
    except KeyboardInterrupt:
        logger.warning("Interrupted — indexed records are kept")
    finally:
        elapsed = time.monotonic() - started
        logger.info(
            "Seen %d | indexed %d | unchanged %d | too short %d | no text %d | %.0fs",
            tally.seen,
            tally.indexed,
            tally.unchanged,
            tally.too_short,
            tally.no_text,
            elapsed,
        )
        if tally.rungs:
            logger.info("Full-text ladder: %s", dict(sorted(tally.rungs.items())))
        if service is not None and store is not None:
            logger.info("Stoplist rebuilt: %d common hashes", service.refresh_stoplist())
            logger.info("Corpus stats: %s", store.stats())
            store.close()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
