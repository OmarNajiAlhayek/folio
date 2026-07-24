"""Extract search query passages from manuscript plain text."""

from __future__ import annotations


def extract_query_passages(
    text: str,
    *,
    max_queries: int = 5,
    min_chars: int = 80,
    max_query_chars: int = 200,
) -> list[str]:
    paragraphs = [
        p.strip()
        for p in text.split("\n\n")
        if len(p.strip()) >= min_chars
    ]
    paragraphs.sort(key=len, reverse=True)
    return [p[:max_query_chars] for p in paragraphs[:max_queries]]
