"""Cross-language parity for Arabic normalization.

`packages/shared/text/search-normalize.ts` is a port of
:mod:`app.ml.exact_match.arabic_normalize`, used by the Next.js frontend for
search highlighting and by the Nest backend to fold query strings before they
reach Postgres. The three have to agree, so both sides assert against one
fixture rather than against each other's expectations.

The fixture was generated from *this* module — it is the reference. A failure
here means the Python normalizer changed: regenerate the fixture and update the
TypeScript port in the same commit, or search results will silently diverge from
what the highlighter marks.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.ml.exact_match.arabic_normalize import normalize_text, tokenize

FIXTURE = (
    Path(__file__).resolve().parents[3]
    / "packages"
    / "shared"
    / "text"
    / "search-normalize.fixture.json"
)


def _load_cases() -> list[dict]:
    if not FIXTURE.exists():
        pytest.skip(f"shared fixture not present at {FIXTURE}")
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


CASES = _load_cases() if FIXTURE.exists() else []


@pytest.mark.parametrize("case", CASES, ids=lambda c: c["name"])
def test_normalize_text_matches_fixture(case: dict) -> None:
    assert normalize_text(case["input"]) == case["normalized"]


@pytest.mark.parametrize("case", CASES, ids=lambda c: c["name"])
def test_tokenize_matches_fixture(case: dict) -> None:
    actual = [
        {"text": t.text, "start": t.start, "end": t.end} for t in tokenize(case["input"])
    ]
    assert actual == case["tokens"]


def test_fixture_still_covers_every_fold() -> None:
    """Guards against someone trimming the fixture until it passes."""
    names = {case["name"] for case in CASES}
    required = {
        "hamza-above",
        "ta-marbuta",
        "alef-maqsura",
        "harakat",
        "tatweel",
        "arabic-indic-digits",
        "farsi-ya-keheh",
    }
    assert required <= names


def test_offsets_index_the_original_text() -> None:
    """The property the whole highlight path rests on."""
    for case in CASES:
        text = case["input"]
        for token in case["tokens"]:
            assert 0 <= token["start"] < token["end"] <= len(text)
