"""OAI-PMH client — structured harvesting of regional journal archives.

This is the tier that closes the Arabic gap, and it is the only external tier
that touches no search engine. OJS powers a large share of Arab and regional
journals, and every OJS install exposes an OAI-PMH endpoint whose entire purpose
is bulk metadata harvesting. So there is no HTML to scrape, no bot detection to
fight, no per-site adapter to maintain, and no argument about whether we are
allowed to be there.

Protocol notes that matter in practice:

- Pagination is by ``resumptionToken``, and when you send one you may send *no*
  other argument except ``verb`` — a very common implementation mistake.
- ``503`` with ``Retry-After`` is part of the spec, not an error. Repositories
  use it for flow control and expect the harvester to wait.
- Records can be tombstones (``<header status="deleted">``) and carry no
  metadata; they must be skipped, not parsed.
- ``noRecordsMatch`` is an empty result, not a failure.
"""

from __future__ import annotations

import logging
import re
import time
import xml.etree.ElementTree as ET
from collections.abc import Iterator
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

OAI_NS = "{http://www.openarchives.org/OAI/2.0/}"
DC_NS = "{http://purl.org/dc/elements/1.1/}"
OAI_DC_NS = "{http://www.openarchives.org/OAI/2.0/oai_dc/}"

DEFAULT_USER_AGENT = "FolioJournalBot/1.0 (+https://damascusuniversity.edu.sy; corpus harvest)"
_MAX_RETRIES = 4
_MAX_RETRY_WAIT = 120

# Errors that mean "nothing here", not "something broke".
_EMPTY_ERROR_CODES = frozenset({"noRecordsMatch", "noSetHierarchy"})


class OaiPmhError(RuntimeError):
    """Raised when the repository is unreachable or returns a protocol error."""


@dataclass(frozen=True)
class OaiIdentity:
    repository_name: str
    base_url: str
    protocol_version: str
    earliest_datestamp: str
    granularity: str
    admin_emails: tuple[str, ...] = ()

    @property
    def supports_day_granularity(self) -> bool:
        return "YYYY-MM-DD" in self.granularity


@dataclass(frozen=True)
class OaiRecord:
    """One harvested article, flattened from Dublin Core."""

    identifier: str
    datestamp: str
    title: str = ""
    creators: tuple[str, ...] = ()
    description: str = ""
    date: str = ""
    language: str = ""
    doi: str = ""
    landing_url: str = ""
    source: str = ""
    sets: tuple[str, ...] = ()
    identifiers: tuple[str, ...] = field(default_factory=tuple)

    @property
    def year(self) -> int | None:
        for chunk in (self.date or "").replace("/", "-").split("-"):
            if len(chunk) == 4 and chunk.isdigit():
                return int(chunk)
        return None

    @property
    def authors(self) -> str:
        return ", ".join(self.creators)

    @property
    def source_ref(self) -> str:
        """Stable identity: DOI when present, else the OAI identifier."""
        return f"doi:{self.doi}" if self.doi else f"oai:{self.identifier}"

    @property
    def journal_code(self) -> str:
        """OJS journal path from the setSpec (``engj:ART`` -> ``engj``)."""
        for spec in self.sets:
            code = spec.split(":", 1)[0].strip()
            if code and code.lower() != "index":
                return code
        return ""

    @property
    def article_url(self) -> str:
        """
        Landing URL corrected for site-wide OJS harvesting.

        A site-wide endpoint (``/index.php/index/oai``) emits article URLs under
        the ``index`` path — and that path **redirects to a login page**, so
        following it verbatim yields site chrome instead of the article. The real
        journal path is in the setSpec. Harvesting each journal's own endpoint
        avoids this, but the site-wide one is the useful entry point because it
        covers every journal at once.
        """
        url = self.landing_url
        code = self.journal_code
        if not url or not code:
            return url
        return re.sub(r"(/index\.php)/index/(?=(?:[a-z]{2}/)?article/)", rf"\1/{code}/", url)


def _require_requests() -> Any:
    try:
        import requests
    except ImportError as err:
        raise OaiPmhError(
            'requests is required for OAI-PMH harvesting. Run: pip install -e ".[corpus]"',
        ) from err
    return requests


def _text(element: ET.Element | None) -> str:
    return (element.text or "").strip() if element is not None else ""


def _looks_like_doi(value: str) -> bool:
    return value.startswith("10.") or "doi.org/" in value


def _extract_doi(value: str) -> str:
    if "doi.org/" in value:
        return value.split("doi.org/", 1)[1].strip()
    return value.strip()


def parse_record(record_el: ET.Element) -> OaiRecord | None:
    """Flatten one ``<record>`` to an :class:`OaiRecord`, or ``None`` if deleted."""
    header = record_el.find(f"{OAI_NS}header")
    if header is None:
        return None
    if (header.get("status") or "").lower() == "deleted":
        return None

    identifier = _text(header.find(f"{OAI_NS}identifier"))
    datestamp = _text(header.find(f"{OAI_NS}datestamp"))
    sets = tuple(_text(s) for s in header.findall(f"{OAI_NS}setSpec"))

    dc = record_el.find(f"{OAI_NS}metadata/{OAI_DC_NS}dc")
    if dc is None:
        return None

    identifiers = tuple(_text(e) for e in dc.findall(f"{DC_NS}identifier") if _text(e))
    doi = ""
    landing_url = ""
    for value in identifiers:
        if _looks_like_doi(value) and not doi:
            doi = _extract_doi(value)
        elif value.startswith("http") and not landing_url:
            landing_url = value
    # A DOI URL is still a usable landing page when nothing else is offered.
    if not landing_url:
        landing_url = next((v for v in identifiers if v.startswith("http")), "")

    descriptions = [_text(e) for e in dc.findall(f"{DC_NS}description")]
    return OaiRecord(
        identifier=identifier,
        datestamp=datestamp,
        title=_text(dc.find(f"{DC_NS}title")),
        creators=tuple(_text(e) for e in dc.findall(f"{DC_NS}creator") if _text(e)),
        description=max(descriptions, key=len) if descriptions else "",
        date=_text(dc.find(f"{DC_NS}date")),
        language=_text(dc.find(f"{DC_NS}language")),
        doi=doi,
        landing_url=landing_url,
        source=_text(dc.find(f"{DC_NS}source")),
        sets=sets,
        identifiers=identifiers,
    )


class OaiPmhClient:
    """Polite, resumption-token-aware OAI-PMH harvester."""

    def __init__(
        self,
        base_url: str,
        *,
        timeout: int = 60,
        sleep_between_requests: float = 1.0,
        user_agent: str = DEFAULT_USER_AGENT,
    ) -> None:
        parsed = urlparse(base_url)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise OaiPmhError(f"Not a usable OAI base URL: {base_url!r}")
        self._base_url = base_url.rstrip("?&")
        self._timeout = timeout
        self._sleep = sleep_between_requests
        self._user_agent = user_agent
        self._session: Any | None = None

    @property
    def base_url(self) -> str:
        return self._base_url

    def _get_session(self) -> Any:
        if self._session is None:
            requests = _require_requests()
            self._session = requests.Session()
            self._session.headers.update({"User-Agent": self._user_agent})
        return self._session

    def _request(self, params: dict[str, str]) -> ET.Element:
        session = self._get_session()
        for attempt in range(1, _MAX_RETRIES + 1):
            try:
                response = session.get(self._base_url, params=params, timeout=self._timeout)
            except Exception as exc:
                if attempt == _MAX_RETRIES:
                    raise OaiPmhError(f"{self._base_url} unreachable: {exc}") from exc
                time.sleep(min(_MAX_RETRY_WAIT, 2**attempt))
                continue

            # 503 + Retry-After is the spec's flow control, not a failure.
            if response.status_code == 503:
                wait = min(_MAX_RETRY_WAIT, float(response.headers.get("Retry-After", 2**attempt)))
                logger.info("Repository asked us to wait %.0fs (503 Retry-After)", wait)
                time.sleep(wait)
                continue
            if response.status_code >= 500:
                if attempt == _MAX_RETRIES:
                    raise OaiPmhError(f"{self._base_url} returned {response.status_code}")
                time.sleep(min(_MAX_RETRY_WAIT, 2**attempt))
                continue
            if not response.ok:
                raise OaiPmhError(
                    f"{self._base_url} returned {response.status_code}: {response.text[:200]}",
                )

            try:
                return ET.fromstring(response.content)
            except ET.ParseError as err:
                raise OaiPmhError(f"Malformed OAI-PMH XML from {self._base_url}: {err}") from err

        raise OaiPmhError(f"{self._base_url} did not answer after {_MAX_RETRIES} attempts")

    @staticmethod
    def _check_error(root: ET.Element) -> str | None:
        """Return an error code, raising for anything that is not an empty result."""
        error = root.find(f"{OAI_NS}error")
        if error is None:
            return None
        code = error.get("code") or "unknown"
        if code in _EMPTY_ERROR_CODES:
            return code
        raise OaiPmhError(f"OAI-PMH error {code}: {(error.text or '').strip()}")

    def identify(self) -> OaiIdentity:
        """Probe the endpoint. This is the one-command test for 'is this OAI-PMH?'."""
        root = self._request({"verb": "Identify"})
        self._check_error(root)
        node = root.find(f"{OAI_NS}Identify")
        if node is None:
            raise OaiPmhError(f"{self._base_url} answered without an <Identify> element")
        return OaiIdentity(
            repository_name=_text(node.find(f"{OAI_NS}repositoryName")),
            base_url=_text(node.find(f"{OAI_NS}baseURL")) or self._base_url,
            protocol_version=_text(node.find(f"{OAI_NS}protocolVersion")),
            earliest_datestamp=_text(node.find(f"{OAI_NS}earliestDatestamp")),
            granularity=_text(node.find(f"{OAI_NS}granularity")),
            admin_emails=tuple(_text(e) for e in node.findall(f"{OAI_NS}adminEmail")),
        )

    def list_sets(self) -> list[tuple[str, str]]:
        """``(setSpec, setName)`` pairs — in OJS these are journals and sections."""
        sets: list[tuple[str, str]] = []
        params: dict[str, str] = {"verb": "ListSets"}
        while True:
            root = self._request(params)
            if self._check_error(root):
                return sets
            container = root.find(f"{OAI_NS}ListSets")
            if container is None:
                return sets
            for node in container.findall(f"{OAI_NS}set"):
                sets.append(
                    (_text(node.find(f"{OAI_NS}setSpec")), _text(node.find(f"{OAI_NS}setName"))),
                )
            token = _text(container.find(f"{OAI_NS}resumptionToken"))
            if not token:
                return sets
            params = {"verb": "ListSets", "resumptionToken": token}
            time.sleep(self._sleep)

    def list_records(
        self,
        *,
        metadata_prefix: str = "oai_dc",
        set_spec: str | None = None,
        from_date: str | None = None,
        until_date: str | None = None,
        limit: int | None = None,
    ) -> Iterator[OaiRecord]:
        """
        Stream records, following resumption tokens.

        ``from_date`` makes harvesting incremental — a nightly job passes the last
        successful run's date and receives only what changed.
        """
        params: dict[str, str] = {"verb": "ListRecords", "metadataPrefix": metadata_prefix}
        if set_spec:
            params["set"] = set_spec
        if from_date:
            params["from"] = from_date
        if until_date:
            params["until"] = until_date

        yielded = 0
        page = 0
        while True:
            root = self._request(params)
            if self._check_error(root):
                logger.info("Repository reported no matching records")
                return

            container = root.find(f"{OAI_NS}ListRecords")
            if container is None:
                return

            page += 1
            deleted = 0
            for record_el in container.findall(f"{OAI_NS}record"):
                record = parse_record(record_el)
                if record is None:
                    deleted += 1
                    continue
                yield record
                yielded += 1
                if limit is not None and yielded >= limit:
                    return

            logger.debug("Page %d: %d records (%d deleted)", page, yielded, deleted)

            token = _text(container.find(f"{OAI_NS}resumptionToken"))
            if not token:
                return
            # Sending any other argument alongside a resumptionToken is a protocol error.
            params = {"verb": "ListRecords", "resumptionToken": token}
            time.sleep(self._sleep)


def guess_oai_endpoints(site_url: str) -> list[str]:
    """
    Candidate OAI base URLs for a site, most likely first.

    OJS is formulaic, so probing beats asking. Feed each to
    :meth:`OaiPmhClient.identify` until one answers.
    """
    parsed = urlparse(site_url if "://" in site_url else f"https://{site_url}")
    origin = f"{parsed.scheme}://{parsed.netloc}"
    path = parsed.path.rstrip("/")

    candidates: list[str] = []
    if path:
        candidates.append(f"{origin}{path}/oai")
    candidates.extend(
        [
            f"{origin}/index.php/index/oai",  # OJS site-wide, covers every journal
            f"{origin}/oai",
            f"{origin}/index.php/oai",
            f"{origin}/oai/request",  # DSpace
            f"{origin}/server/oai/request",  # DSpace 7
        ],
    )
    seen: set[str] = set()
    return [c for c in candidates if not (c in seen or seen.add(c))]
