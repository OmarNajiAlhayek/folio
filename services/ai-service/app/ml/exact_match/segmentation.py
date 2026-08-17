"""Document segmentation: drop reference lists, flag quoted passages.

Without this every report drowns in true-but-worthless matches. A bibliography is
*supposed* to be identical across papers citing the same work, and a marked
quotation is attribution rather than copying — neither belongs in an overlap
percentage, but a quotation still belongs in the report, labelled.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.ml.exact_match.arabic_normalize import normalize_token

# Normalized forms (post `normalize_token`, space-joined) of headings that open a
# reference list. Arabic entries fold hamza/alef/ta-marbuta, so e.g. "المصادر
# والمراجع" is stored as its normalized spelling.
_REFERENCE_HEADINGS: frozenset[str] = frozenset(
    {
        normalize_heading
        for normalize_heading in (
            " ".join(normalize_token(word) for word in heading.split())
            for heading in (
                "المراجع",
                "المراجع والمصادر",
                "المصادر",
                "المصادر والمراجع",
                "المصادر و المراجع",
                "قائمة المراجع",
                "قائمة المصادر",
                "قائمة المصادر والمراجع",
                "ثبت المراجع",
                "مراجع البحث",
                "مصادر البحث",
                "الهوامش والمراجع",
                "المراجع باللغة العربية",
                "المراجع الأجنبية",
                "References",
                "Reference List",
                "Bibliography",
                "Works Cited",
                "Literature Cited",
            )
        )
        if normalize_heading
    }
)

# Leading list markers a heading may carry: "5." / "٥-" / "(3)" / "IV."
_HEADING_PREFIX = re.compile(r"^[\s\d٠-٩IVXivx\.\)\(\-–—:·•]+")
_HEADING_SUFFIX = re.compile(r"[\s:：\.\-–—]+$")

# A heading is a short standalone line; a sentence that merely mentions المراجع is not.
_MAX_HEADING_CHARS = 80

_QUOTE_PAIRS: tuple[tuple[str, str], ...] = (
    ("«", "»"),  # guillemets — dominant in Arabic typography
    ("“", "”"),  # curly double quotes
    ("‹", "›"),  # single guillemets
    # Quranic ornate parentheses. Written as code points because the glyphs render
    # mirrored in an RTL editor, which makes the literal pair unreviewable.
    (chr(0xFD3E), chr(0xFD3F)),  # ORNATE LEFT / RIGHT PARENTHESIS
    ('"', '"'),  # straight double quotes, paired left-to-right
)

# Beyond this, an opening mark almost certainly never got closed.
_MAX_QUOTE_CHARS = 3000


@dataclass(frozen=True)
class ReferenceSplit:
    """Body text kept for matching, plus where the reference list started."""

    body: str
    references_start: int | None

    @property
    def stripped_chars(self) -> int:
        return 0 if self.references_start is None else len(self.body) - self.references_start


def _normalize_heading_line(line: str) -> str:
    stripped = _HEADING_SUFFIX.sub("", _HEADING_PREFIX.sub("", line)).strip()
    if not stripped or len(stripped) > _MAX_HEADING_CHARS:
        return ""
    return " ".join(
        normalized for word in stripped.split() if (normalized := normalize_token(word))
    )


def find_reference_section(text: str, *, min_position_ratio: float = 0.4) -> int | None:
    """
    Character offset where the reference list begins, or ``None``.

    Only headings in the last ``1 - min_position_ratio`` of the document count, and
    the *last* qualifying heading wins — papers routinely have both an Arabic and a
    foreign-language reference list.
    """
    if not text.strip():
        return None

    floor = int(len(text) * min_position_ratio)
    found: int | None = None
    offset = 0
    for line in text.splitlines(keepends=True):
        line_start = offset
        offset += len(line)
        if line_start < floor:
            continue
        if _normalize_heading_line(line) in _REFERENCE_HEADINGS:
            found = line_start
    return found


def strip_reference_section(text: str, *, min_position_ratio: float = 0.4) -> ReferenceSplit:
    """Truncate the document at its reference list."""
    start = find_reference_section(text, min_position_ratio=min_position_ratio)
    if start is None:
        return ReferenceSplit(body=text, references_start=None)
    return ReferenceSplit(body=text[:start], references_start=start)


def quote_spans(text: str) -> list[tuple[int, int]]:
    """
    Character spans of quoted passages, marks included.

    Overlapping spans from different mark styles are merged. Unclosed marks and
    implausibly long spans are ignored rather than swallowing the document.
    """
    if not text:
        return []

    spans: list[tuple[int, int]] = []
    for opener, closer in _QUOTE_PAIRS:
        pos = 0
        while True:
            start = text.find(opener, pos)
            if start == -1:
                break
            search_from = start + len(opener)
            end = text.find(closer, search_from)
            if end == -1:
                break
            if end - start <= _MAX_QUOTE_CHARS:
                spans.append((start, end + len(closer)))
            pos = end + len(closer)

    if not spans:
        return []

    spans.sort()
    merged: list[tuple[int, int]] = [spans[0]]
    for start, end in spans[1:]:
        last_start, last_end = merged[-1]
        if start <= last_end:
            merged[-1] = (last_start, max(last_end, end))
        else:
            merged.append((start, end))
    return merged


def spans_cover(spans: list[tuple[int, int]], start: int, end: int) -> bool:
    """True when ``[start, end)`` lies mostly inside one quoted span."""
    if not spans:
        return False
    length = max(1, end - start)
    for span_start, span_end in spans:
        if span_start > end:
            break
        overlap = min(end, span_end) - max(start, span_start)
        if overlap > 0 and overlap / length >= 0.6:
            return True
    return False
