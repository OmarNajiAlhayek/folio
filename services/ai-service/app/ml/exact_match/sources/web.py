"""Web tier: turn Google's index into the exact matcher, then keep what it finds.

The web cannot be indexed the way a corpus can — so the direction inverts. Instead
of *index then query*, this tier *queries then fetches*:

1. pick the most distinctive passages of the manuscript (rarest k-grams, scored
   against the boilerplate stoplist — a passage of stock phrases returns noise)
2. send each as a **quoted phrase query**, which makes Google do exact matching
   across the whole web on our behalf
3. fetch the hits (robots.txt honoured), and index each page into the corpus as
   ``SourceKind.WEB`` — fingerprints only, never the page text

Step 3 is what makes this compound: every check permanently enlarges the corpus
at roughly 40 bytes per kept k-gram, so pages found for one manuscript are
matched instantly, and for free, for every later one. After harvesting, the normal
:meth:`ExactMatchService.detect` covers back catalogue, open access, and web in a
single pass.

Quota note: Google CSE gives 100 free queries/day, then bills per thousand with a
hard daily cap. ``max_queries`` per manuscript is the knob that matters.
"""

from __future__ import annotations

import logging
import urllib.robotparser
from collections.abc import Iterable
from dataclasses import dataclass
from urllib.parse import urlparse

from app.ml.exact_match.arabic_normalize import tokenize
from app.ml.exact_match.config import ExactMatchConfig
from app.ml.exact_match.corpus_store import CorpusStore
from app.ml.exact_match.exact_match_service import ExactMatchService
from app.ml.exact_match.segmentation import strip_reference_section
from app.ml.exact_match.types import CorpusDocument, SourceKind
from app.ml.exact_match.winnow import fingerprint

logger = logging.getLogger(__name__)

# Google drops phrase queries beyond roughly this length, and a shorter phrase is
# likelier to survive a copyist's light edits anyway.
MAX_PHRASE_WORDS = 28
MIN_PASSAGE_TOKENS = 20

_USER_AGENT = "FolioJournalBot/1.0 (+similarity-check)"
_ROBOTS_TIMEOUT = 10


@dataclass(frozen=True)
class Passage:
    """A candidate query passage with its distinctiveness score."""

    text: str
    token_count: int
    distinctiveness: float


@dataclass(frozen=True)
class HarvestResult:
    queries_used: int
    urls_seen: int
    pages_indexed: int
    errors: list[str]


def split_passages(text: str, *, min_tokens: int = MIN_PASSAGE_TOKENS) -> list[str]:
    """Split into paragraph-ish blocks long enough to be worth a query."""
    blocks: list[str] = []
    for raw in text.replace("\r\n", "\n").split("\n\n"):
        candidate = " ".join(raw.split())
        if len(tokenize(candidate)) >= min_tokens:
            blocks.append(candidate)
    return blocks


def build_phrase_query(passage: str, *, max_words: int = MAX_PHRASE_WORDS) -> str:
    """
    Wrap a passage as a quoted phrase query.

    Quoting is the entire trick: it makes the search engine do exact matching,
    which is the same thing the local corpus does, over an index nobody else can
    replicate.
    """
    words = passage.split()[:max_words]
    phrase = " ".join(words).replace('"', " ").strip()
    return f'"{phrase}"' if phrase else ""


class WebCorpusHarvester:
    """Find candidate web sources for a manuscript and fold them into the corpus."""

    def __init__(
        self,
        store: CorpusStore,
        service: ExactMatchService,
        *,
        api_key: str,
        cse_id: str,
        max_queries: int = 5,
        results_per_query: int = 10,
        search_lang: str = "ar",
        exclude_domains: Iterable[str] = (),
        respect_robots: bool = True,
        config: ExactMatchConfig | None = None,
    ) -> None:
        self._store = store
        self._service = service
        self._api_key = api_key
        self._cse_id = cse_id
        self._max_queries = max_queries
        self._results_per_query = results_per_query
        self._search_lang = search_lang
        self._exclude_domains = {d.lower().lstrip(".") for d in exclude_domains}
        self._respect_robots = respect_robots
        self._config = config or ExactMatchConfig()
        self._robots_cache: dict[str, urllib.robotparser.RobotFileParser | None] = {}

    # ------------------------------------------------------------- selection

    def rank_passages(self, text: str) -> list[Passage]:
        """
        Order passages by how little boilerplate they contain.

        Distinctiveness is the share of a passage's fingerprints that the stoplist
        does *not* flag as common. A methods paragraph made of stock sentences
        scores near zero and is never spent on a query.
        """
        passages = split_passages(strip_reference_section(text).body)
        if not passages:
            return []

        scored: list[Passage] = []
        for passage in passages:
            words = [token.text for token in tokenize(passage)]
            hashes = [h for h, _ in fingerprint(words, self._config)]
            if not hashes:
                continue
            common = self._store.filter_common_hashes(hashes)
            scored.append(
                Passage(
                    text=passage,
                    token_count=len(words),
                    distinctiveness=1.0 - (len(common) / len(hashes)),
                ),
            )

        scored.sort(key=lambda p: (p.distinctiveness, p.token_count), reverse=True)
        return scored

    # --------------------------------------------------------------- fetching

    def _robots_allows(self, url: str) -> bool:
        if not self._respect_robots:
            return True
        parsed = urlparse(url)
        origin = f"{parsed.scheme}://{parsed.netloc}"
        if origin not in self._robots_cache:
            parser = urllib.robotparser.RobotFileParser()
            parser.set_url(f"{origin}/robots.txt")
            try:
                parser.read()
                self._robots_cache[origin] = parser
            except Exception as exc:
                # An unreachable robots.txt is not permission; but it is also not a
                # refusal. Treat it as allowed and log, matching common crawler practice.
                logger.debug("robots.txt unreachable for %s: %s", origin, exc)
                self._robots_cache[origin] = None
        parser = self._robots_cache[origin]
        if parser is None:
            return True
        return parser.can_fetch(_USER_AGENT, url)

    def _is_excluded(self, url: str) -> bool:
        host = (urlparse(url).hostname or "").lower()
        return any(
            host == domain or host.endswith(f".{domain}") for domain in self._exclude_domains
        )

    # --------------------------------------------------------------- harvest

    def harvest(self, submission_text: str) -> HarvestResult:
        """Search, fetch, and index web candidates. Returns what it did, not matches."""
        from app.ml.web_similarity.google_cse import get_search_results
        from app.ml.web_similarity.web_fetch import fetch_web_paragraphs

        passages = self.rank_passages(submission_text)[: self._max_queries]
        if not passages:
            return HarvestResult(0, 0, 0, ["no passage long enough to query"])

        errors: list[str] = []
        seen_urls: set[str] = set()
        indexed = 0
        queries_used = 0

        for passage in passages:
            query = build_phrase_query(passage.text)
            if not query:
                continue
            queries_used += 1
            urls = get_search_results(
                query,
                api_key=self._api_key,
                cse_id=self._cse_id,
                num_results=self._results_per_query,
                search_lang=self._search_lang,
            )
            for url in urls:
                if url in seen_urls:
                    continue
                seen_urls.add(url)
                if self._is_excluded(url):
                    logger.debug("Skipping excluded domain: %s", url)
                    continue
                if not self._robots_allows(url):
                    logger.info("robots.txt disallows fetching %s", url)
                    continue

                paragraphs = fetch_web_paragraphs(url)
                if not paragraphs:
                    continue
                page_text = "\n\n".join(paragraphs)

                try:
                    result = self._service.index_document(
                        CorpusDocument(
                            source_kind=SourceKind.WEB,
                            source_ref=url,
                            title=url,
                            source_url=url,
                            license="web page (fingerprints only)",
                        ),
                        page_text,
                        # Never retain page text: fingerprints redistribute nothing.
                        store_text=False,
                        strip_references=False,
                    )
                except Exception as exc:
                    errors.append(f"{url}: {exc}")
                    logger.debug("Failed to index %s: %s", url, exc)
                    continue

                if not result.unchanged:
                    indexed += 1

        logger.info(
            "Web harvest: %d queries, %d URLs, %d pages indexed",
            queries_used,
            len(seen_urls),
            indexed,
        )
        return HarvestResult(
            queries_used=queries_used,
            urls_seen=len(seen_urls),
            pages_indexed=indexed,
            errors=errors,
        )
