"""Resolve a landing page to full text, without per-site scrapers.

Academia standardized itself so Google Scholar would index it, and that
standardization is what makes this generic. The ladder, cheapest and most
reliable first:

0. the URL is already a PDF
1. DOI -> Unpaywall / OpenAlex, which answer "where is the open copy" directly —
   this rung needs no knowledge of any website at all
2. ``<meta name="citation_pdf_url">`` — Scholar requires it, so publishers emit it
3. OJS galley pattern (``/article/view/X/Y`` -> ``/article/download/X/Y``)
4. generic anchor heuristic, Arabic and English labels
5. give up on the PDF and keep the landing page's own text

Rung 5 is a success, not a failure: an abstract is a few hundred words, well
above the match floor, and still fingerprints usefully.

Everything fetched is verified with the ``%PDF-`` magic bytes before it is
trusted. A URL ending in ``.pdf`` very often returns a login wall, and
fingerprinting that wall would make every later manuscript match it.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Any
from urllib.parse import urljoin, urlparse

from app.ml.exact_match.text_extract import TextExtractionError, extract_pdf_bytes

logger = logging.getLogger(__name__)

DEFAULT_TIMEOUT = 45
MAX_PDF_BYTES = 40 * 1024 * 1024
MAX_HTML_BYTES = 2 * 1024 * 1024
UNPAYWALL_ENDPOINT = "https://api.unpaywall.org/v2/{doi}"
OPENALEX_ENDPOINT = "https://api.openalex.org/works/doi:{doi}"

_CITATION_PDF = (
    re.compile(
        rb'<meta[^>]+name=["\']citation_pdf_url["\'][^>]+content=["\']([^"\']+)["\']',
        re.IGNORECASE,
    ),
    re.compile(
        rb'<meta[^>]+content=["\']([^"\']+)["\'][^>]+name=["\']citation_pdf_url["\']',
        re.IGNORECASE,
    ),
)
_OJS_GALLEY = re.compile(
    r'href=["\']([^"\']*/article/(?:download|view)/\d+/\d+)["\']',
    re.IGNORECASE,
)
_ANCHOR = re.compile(rb'<a[^>]+href=["\']([^"\']+)["\'][^>]*>(.{0,150}?)</a>', re.IGNORECASE | re.S)
_PDF_LABELS = (
    "pdf",
    "download",
    "full text",
    "fulltext",
    "تحميل",
    "النص الكامل",
    "نص كامل",
    "المقال كامل",
)
_LOGIN_MARKERS = (b"sign in", b"log in", b"login", b"subscribe", b"purchase access")


@dataclass(frozen=True)
class FullText:
    """Text recovered for a corpus document, plus how it was obtained."""

    text: str
    url: str
    rung: str
    is_pdf: bool
    note: str = ""
    # Kept so a caller that judges the text unreadable can OCR the same bytes
    # instead of downloading them a second time. Only set for PDFs.
    raw_pdf: bytes | None = None

    @property
    def char_count(self) -> int:
        return len(self.text)


def _get(session: Any, url: str, *, timeout: int, stream: bool = False) -> Any | None:
    try:
        return session.get(url, timeout=timeout, stream=stream, allow_redirects=True)
    except Exception as exc:
        logger.debug("GET failed for %s: %s", url, exc)
        return None


def _read_capped(response: Any, cap: int) -> bytes:
    try:
        return response.raw.read(cap, decode_content=True) or b""
    except Exception:
        return (response.content or b"")[:cap]


def unpaywall_pdf(session: Any, doi: str, *, email: str, timeout: int) -> str | None:
    """Best open-access PDF for a DOI. Free, no key — the email is the courtesy."""
    response = _get(session, f"{UNPAYWALL_ENDPOINT.format(doi=doi)}?email={email}", timeout=timeout)
    if response is None or not response.ok:
        return None
    try:
        location = (response.json() or {}).get("best_oa_location") or {}
        return location.get("url_for_pdf") or None
    except Exception:
        return None


def openalex_pdf(session: Any, doi: str, *, timeout: int) -> str | None:
    response = _get(session, OPENALEX_ENDPOINT.format(doi=doi), timeout=timeout)
    if response is None or not response.ok:
        return None
    try:
        location = (response.json() or {}).get("best_oa_location") or {}
        return location.get("pdf_url") or None
    except Exception:
        return None


def citation_pdf_url(html: bytes, base_url: str) -> str | None:
    for pattern in _CITATION_PDF:
        match = pattern.search(html)
        if match:
            return urljoin(base_url, match.group(1).decode("utf-8", "replace"))
    return None


def ojs_galley_url(html: bytes, base_url: str) -> str | None:
    if b"/article/" not in html:
        return None
    text = html.decode("utf-8", "replace")
    match = _OJS_GALLEY.search(text)
    if match:
        return urljoin(base_url, match.group(1)).replace("/article/view/", "/article/download/")
    return None


def generic_pdf_link(html: bytes, base_url: str) -> str | None:
    fallback: str | None = None
    for match in _ANCHOR.finditer(html):
        href = match.group(1).decode("utf-8", "replace")
        label = match.group(2).decode("utf-8", "replace").lower()
        if ".pdf" in href.lower():
            return urljoin(base_url, href)
        if any(hint in f"{href.lower()} {label}" for hint in _PDF_LABELS) and fallback is None:
            fallback = urljoin(base_url, href)
    return fallback


def html_to_text(html: bytes) -> str:
    try:
        from bs4 import BeautifulSoup
    except ImportError:
        return ""
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "nav", "header", "footer", "form"]):
        tag.decompose()
    blocks = [
        text
        for tag in soup.find_all(["p", "div"])
        if len(text := tag.get_text(" ", strip=True)) >= 40
    ]
    # Nested divs duplicate their children's text; keep first occurrences only.
    seen: set[str] = set()
    return "\n\n".join(b for b in blocks if not (b in seen or seen.add(b)))


def _fetch_pdf(session: Any, url: str, *, timeout: int) -> tuple[bytes | None, str]:
    response = _get(session, url, timeout=timeout, stream=True)
    if response is None:
        return None, "unreachable"
    if not response.ok:
        return None, f"HTTP {response.status_code}"

    body = _read_capped(response, MAX_PDF_BYTES)
    if body.startswith(b"%PDF-"):
        return body, "ok"

    lowered = body[:4000].lower()
    if any(marker in lowered for marker in _LOGIN_MARKERS):
        return None, "paywall or login page"
    ctype = (response.headers.get("Content-Type") or "").split(";")[0].strip()
    return None, f"not a PDF (content-type {ctype or 'unknown'})"


def resolve_fulltext(
    landing_url: str,
    *,
    session: Any,
    doi: str = "",
    unpaywall_email: str = "",
    timeout: int = DEFAULT_TIMEOUT,
    allow_html_fallback: bool = True,
) -> FullText | None:
    """Walk the ladder for one document. Returns ``None`` only if nothing readable."""
    if not landing_url:
        return None

    def from_pdf(url: str, rung: str) -> FullText | None:
        body, why = _fetch_pdf(session, url, timeout=timeout)
        if body is None:
            logger.debug("PDF rejected at %s (%s): %s", rung, url, why)
            return None
        try:
            extracted = extract_pdf_bytes(body)
        except TextExtractionError as exc:
            logger.debug("PDF unreadable at %s: %s", url, exc)
            return None
        note = f"{extracted.page_count} pages"
        if extracted.stripped_running_lines:
            note += f", {len(extracted.stripped_running_lines)} running lines stripped"
        return FullText(
            text=extracted.text,
            url=url,
            rung=rung,
            is_pdf=True,
            note=note,
            raw_pdf=body,
        )

    # Rung 0
    if urlparse(landing_url).path.lower().endswith(".pdf"):
        result = from_pdf(landing_url, "0-direct-pdf")
        if result:
            return result

    # Rung 1 — DOI resolvers, no site knowledge required
    if doi:
        if unpaywall_email:
            url = unpaywall_pdf(session, doi, email=unpaywall_email, timeout=timeout)
            if url and (result := from_pdf(url, "1-unpaywall")):
                return result
        url = openalex_pdf(session, doi, timeout=timeout)
        if url and (result := from_pdf(url, "1-openalex")):
            return result

    response = _get(session, landing_url, timeout=timeout, stream=True)
    if response is None or not response.ok:
        return None
    html = _read_capped(response, MAX_HTML_BYTES)
    base_url = response.url

    # The landing URL itself may redirect straight to a PDF.
    if html.startswith(b"%PDF-"):
        try:
            extracted = extract_pdf_bytes(html)
            return FullText(
                text=extracted.text,
                url=base_url,
                rung="0-redirected-pdf",
                is_pdf=True,
                note=f"{extracted.page_count} pages",
                raw_pdf=html,
            )
        except TextExtractionError:
            pass

    # Rungs 2-4
    for rung, finder in (
        ("2-citation_pdf_url", citation_pdf_url),
        ("3-ojs-galley", ojs_galley_url),
        ("4-generic-link", generic_pdf_link),
    ):
        url = finder(html, base_url)
        if url and (result := from_pdf(url, rung)):
            return result

    # Rung 5 — abstract-level text still clears the match floor
    if allow_html_fallback:
        text = html_to_text(html)
        if text:
            return FullText(
                text=text,
                url=base_url,
                rung="5-html-only",
                is_pdf=False,
                note="no PDF found; landing page text only",
            )
    return None
