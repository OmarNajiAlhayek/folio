"""Arabic text cleaning and word-based chunking for embedding."""

from __future__ import annotations

import re

from app.ml.vector.config import VectorConfig

# Arabic letters, digits, and word characters; strip other punctuation/symbols.
_NON_WORD_PATTERN = re.compile(r"[^\w\s\u0600-\u06FF]", re.UNICODE)
_WHITESPACE_PATTERN = re.compile(r"\s+")


def clean_text(text: str) -> str:
    """
    Normalize Arabic text before embedding.

    Removes diacritics (tashkeel), tatweel, ligature variants, and punctuation.
    """
    if not text or not text.strip():
        return ""

    try:
        import pyarabic.normalize as normalize
    except ImportError as err:
        from app.ml.vector.types import VectorDependenciesError

        raise VectorDependenciesError(
            "pyarabic is required for text cleaning. Run: pip install -e \".[similarity]\"",
        ) from err

    cleaned = normalize.normalize_searchtext(text)
    cleaned = _NON_WORD_PATTERN.sub(" ", cleaned)
    cleaned = _WHITESPACE_PATTERN.sub(" ", cleaned).strip()
    return cleaned


def combine_summary_text(abstract: str, keywords: str) -> str:
    """Combine abstract and keywords for the summary collection."""
    abstract = abstract.strip()
    keywords = keywords.strip()
    if keywords:
        return f"{abstract} [KEYWORDS] {keywords}".strip()
    return abstract


def chunk_text(
    text: str,
    *,
    chunk_size: int | None = None,
    overlap: int | None = None,
    config: VectorConfig | None = None,
) -> list[str]:
    """
    Split cleaned text into overlapping word windows.

    Defaults: chunk_size=200 words, overlap=50 words (step=150).
    """
    cfg = config or VectorConfig()
    size = chunk_size if chunk_size is not None else cfg.chunk_size_words
    ov = overlap if overlap is not None else cfg.chunk_overlap_words

    if size <= 0:
        raise ValueError("chunk_size must be positive")
    if ov < 0 or ov >= size:
        raise ValueError("overlap must be >= 0 and < chunk_size")

    words = text.split()
    if not words:
        return []

    step = size - ov
    chunks: list[str] = []
    for start in range(0, len(words), step):
        window = words[start : start + size]
        if not window:
            break
        chunk = " ".join(window).strip()
        if chunk:
            chunks.append(chunk)
        if start + size >= len(words):
            break
    return chunks


def chunk_id(article_id: str, chunk_index: int) -> str:
    """Stable Chroma document id for a full-text chunk."""
    return f"{article_id}::chunk::{chunk_index}"


def reviewer_history_id(reviewer_id: str, submission_id: str) -> str:
    """Stable Chroma document id for a reviewer history summary row."""
    return f"{reviewer_id}::{submission_id}"
