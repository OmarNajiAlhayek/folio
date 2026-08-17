"""Arabic normalization for exact-overlap matching.

Pure stdlib on purpose: the fingerprint path must stay installable without the
``[ml]`` / ``[similarity]`` extras, and normalization must be byte-for-byte
reproducible across machines (a corpus fingerprinted on one host has to match a
submission fingerprinted on another).

Differences from :func:`app.ml.vector.text_processing.clean_text`, which is tuned
for embeddings rather than exact matching:

- unifies alef / ya / ta-marbuta / hamza-carrier variants (U+0623 U+0625 U+0622
  U+0671 to U+0627, U+0649 to U+064A, U+0629 to U+0647, U+0624 to U+0648,
  U+0626 to U+064A)
- folds Arabic-Indic and extended Arabic-Indic digits to ASCII
- keeps character offsets into the *original* text so a match can be highlighted

Stemming and stopword removal are deliberately absent: exact matching relies on
word order and function words as signal.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

# Built from code points rather than literals: these characters are invisible or
# combining, so a literal string is unreviewable and corrupts easily in editors.
_COMBINING_RANGES: tuple[tuple[int, int], ...] = (
    (0x0610, 0x061A),  # Arabic signs / honorifics
    (0x064B, 0x065F),  # harakat and extended harakat
    (0x0670, 0x0670),  # superscript alef
    (0x06D6, 0x06ED),  # Quranic annotation marks
    (0x08D3, 0x08FF),  # Arabic Extended-A marks
)

_INVISIBLE_RANGES: tuple[tuple[int, int], ...] = (
    (0x200B, 0x200F),  # ZWSP, ZWNJ, ZWJ, LRM, RLM
    (0x202A, 0x202E),  # bidi embedding / override
    (0x2066, 0x2069),  # bidi isolates
    (0xFE00, 0xFE0F),  # variation selectors
)

_TATWEEL = 0x0640


def _chars_in(ranges: tuple[tuple[int, int], ...]) -> str:
    return "".join(chr(cp) for lo, hi in ranges for cp in range(lo, hi + 1))


_STRIP_CHARS = _chars_in(_COMBINING_RANGES) + _chars_in(_INVISIBLE_RANGES) + chr(_TATWEEL) + "_"

_LETTER_FOLD: dict[str, str] = {
    # alef carriers -> bare alef
    "أ": "ا",  # hamza above
    "إ": "ا",  # hamza below
    "آ": "ا",  # madda
    "ٱ": "ا",  # wasla
    "ٲ": "ا",
    "ٳ": "ا",
    "ٵ": "ا",
    # ya / alef maqsura -> ya
    "ى": "ي",  # alef maqsura
    "ی": "ي",  # Farsi ya
    # hamza carriers
    "ؤ": "و",  # waw with hamza -> waw
    "ئ": "ي",  # ya with hamza -> ya
    "ء": "",  # bare hamza carries no standalone signal
    # ta marbuta -> ha
    "ة": "ه",
    # Farsi/Urdu glyphs that leak in from scanned PDFs
    "ک": "ك",  # keheh -> kaf
    "گ": "ك",  # gaf -> kaf
    "ھ": "ه",  # heh doachashmee -> heh
    "ە": "ه",  # ae -> heh
}

_DIGIT_FOLD: dict[str, str] = {
    **{chr(0x0660 + i): str(i) for i in range(10)},  # Arabic-Indic
    **{chr(0x06F0 + i): str(i) for i in range(10)},  # extended Arabic-Indic
}

_STRIP_TABLE: dict[int, str | None] = {ord(ch): None for ch in _STRIP_CHARS}
_FOLD_TABLE: dict[int, str | None] = {
    ord(k): (v or None) for k, v in {**_LETTER_FOLD, **_DIGIT_FOLD}.items()
}

# Combining marks must stay *inside* a token, otherwise a diacritic splits the word
# (`\w` does not match category Mn).
_TOKEN_CLASS = "".join(
    f"\\u{lo:04x}-\\u{hi:04x}" for lo, hi in (*_COMBINING_RANGES, (_TATWEEL, _TATWEEL))
)
_TOKEN_PATTERN = re.compile(f"[\\w{_TOKEN_CLASS}]+", re.UNICODE)


@dataclass(frozen=True)
class Token:
    """A normalized word plus its span in the original (un-normalized) text."""

    text: str
    start: int
    end: int


def normalize_token(raw: str) -> str:
    """
    Fold one raw word to its exact-match form.

    Returns ``""`` when nothing matchable survives (pure punctuation, a lone
    diacritic, a stray hamza).
    """
    if not raw:
        return ""
    folded = unicodedata.normalize("NFKC", raw)
    folded = folded.translate(_STRIP_TABLE)
    folded = folded.translate(_FOLD_TABLE)
    folded = folded.casefold()
    return "".join(ch for ch in folded if ch.isalnum())


def tokenize(text: str) -> list[Token]:
    """
    Split text into normalized tokens carrying original character offsets.

    Offsets index ``text`` as given, so callers can slice the original string to
    build a highlightable snippet.
    """
    if not text:
        return []
    tokens: list[Token] = []
    for match in _TOKEN_PATTERN.finditer(text):
        normalized = normalize_token(match.group(0))
        if not normalized:
            continue
        tokens.append(Token(text=normalized, start=match.start(), end=match.end()))
    return tokens


def normalize_text(text: str) -> str:
    """Space-joined normalized tokens — used for fingerprints and content_hash only."""
    return " ".join(token.text for token in tokenize(text))


def token_words(tokens: list[Token]) -> list[str]:
    return [token.text for token in tokens]


def snippet_for_span(text: str, tokens: list[Token], start_idx: int, end_idx: int) -> str:
    """
    Slice the original text covered by tokens ``[start_idx, end_idx)``.

    Returns ``""`` when the span is empty; clamps indices that run past the end.
    """
    if not tokens or start_idx >= end_idx:
        return ""
    start_idx = max(0, min(start_idx, len(tokens) - 1))
    end_idx = max(start_idx + 1, min(end_idx, len(tokens)))
    return text[tokens[start_idx].start : tokens[end_idx - 1].end].strip()
