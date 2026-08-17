"""CORE (core.ac.uk) v3 client — open-access full text for the Tier 2 corpus.

CORE aggregates full text from open-access repositories, which is what makes it
worth the integration: OpenAlex and Crossref are far larger but expose metadata
and abstracts only, and an abstract is too short to fingerprint usefully.

Coverage caveat worth stating plainly: CORE is overwhelmingly English-language.
For an Arabic journal this tier supplements the back catalogue and the web check;
it does not replace either.

Only fingerprints are retained for CORE documents — never the text. See
``TEXT_RETAINING_KINDS``.
"""

from __future__ import annotations

import logging
import time
from collections.abc import Iterator
from dataclasses import dataclass
from typing import Any

logger = logging.getLogger(__name__)

CORE_SEARCH_URL = "https://api.core.ac.uk/v3/search/works"

# CORE's free tier is rate-limited per token; on 429 it returns a Retry-After.
_DEFAULT_TIMEOUT = 60
_MAX_RETRIES = 4


class CoreApiError(RuntimeError):
    """Raised when the CORE API cannot be reached or rejects the request."""


@dataclass(frozen=True)
class CoreWork:
    """One open-access work with full text."""

    core_id: str
    title: str
    authors: str
    year: int | None
    language: str
    doi: str
    download_url: str
    full_text: str

    @property
    def source_ref(self) -> str:
        """Stable identity: prefer the DOI, fall back to the CORE id."""
        return f"doi:{self.doi}" if self.doi else f"core:{self.core_id}"


def _require_requests() -> Any:
    try:
        import requests
    except ImportError as err:
        raise CoreApiError(
            'requests is required for the CORE importer. Run: pip install -e ".[web_similarity]"',
        ) from err
    return requests


def _parse_work(raw: dict[str, Any]) -> CoreWork | None:
    full_text = (raw.get("fullText") or "").strip()
    if not full_text:
        return None

    authors = raw.get("authors") or []
    author_names = ", ".join(
        name for author in authors if (name := (author or {}).get("name", "").strip())
    )
    language = raw.get("language") or {}
    return CoreWork(
        core_id=str(raw.get("id") or ""),
        title=(raw.get("title") or "").strip(),
        authors=author_names,
        year=raw.get("yearPublished"),
        language=(language.get("code") or "").strip() if isinstance(language, dict) else "",
        doi=(raw.get("doi") or "").strip(),
        download_url=(raw.get("downloadUrl") or "").strip(),
        full_text=full_text,
    )


class CoreApiClient:
    """Paginated search over CORE works that carry full text."""

    def __init__(
        self,
        api_key: str,
        *,
        timeout: int = _DEFAULT_TIMEOUT,
        sleep_between_pages: float = 1.0,
    ) -> None:
        if not api_key.strip():
            raise CoreApiError("A CORE API key is required (register at core.ac.uk/services/api)")
        self._api_key = api_key.strip()
        self._timeout = timeout
        self._sleep = sleep_between_pages

    def _post(self, payload: dict[str, Any]) -> dict[str, Any]:
        requests = _require_requests()
        headers = {"Authorization": f"Bearer {self._api_key}"}

        for attempt in range(1, _MAX_RETRIES + 1):
            response = requests.post(
                CORE_SEARCH_URL,
                json=payload,
                headers=headers,
                timeout=self._timeout,
            )
            if response.status_code == 429:
                wait = float(response.headers.get("Retry-After", 2**attempt))
                logger.warning("CORE rate limit hit; retrying in %.0fs", wait)
                time.sleep(wait)
                continue
            if response.status_code >= 500:
                wait = float(2**attempt)
                logger.warning(
                    "CORE returned %d; retrying in %.0fs",
                    response.status_code,
                    wait,
                )
                time.sleep(wait)
                continue
            if not response.ok:
                raise CoreApiError(
                    f"CORE search failed: {response.status_code} {response.text[:200]}",
                )
            return response.json()

        raise CoreApiError(f"CORE search failed after {_MAX_RETRIES} attempts")

    def search(
        self,
        query: str,
        *,
        limit: int,
        page_size: int = 50,
        language: str | None = None,
    ) -> Iterator[CoreWork]:
        """
        Yield up to ``limit`` works that have full text.

        ``query`` uses CORE's Lucene-style syntax, e.g.
        ``"civil engineering" AND yearPublished>=2015``.
        """
        full_query = query
        if language:
            full_query = f"({query}) AND language.code:{language}"

        yielded = 0
        offset = 0
        while yielded < limit:
            batch = min(page_size, limit - yielded)
            payload = {
                "q": full_query,
                "limit": batch,
                "offset": offset,
                # Asking only for what is used keeps responses (and memory) small.
                "entity_type": "work",
            }
            data = self._post(payload)
            results = data.get("results") or []
            if not results:
                return

            for raw in results:
                work = _parse_work(raw)
                if work is None:
                    continue
                yield work
                yielded += 1
                if yielded >= limit:
                    return

            offset += len(results)
            if self._sleep:
                time.sleep(self._sleep)
