"""Fetch paragraph text from web pages."""

from __future__ import annotations

import logging

import requests
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

_DEFAULT_TIMEOUT = 10
_MIN_PARAGRAPH_CHARS = 20


def fetch_web_paragraphs(url: str, *, timeout: int = _DEFAULT_TIMEOUT) -> list[str]:
    try:
        response = requests.get(
            url,
            timeout=timeout,
            headers={"User-Agent": "FolioJournalBot/1.0 (similarity-check)"},
        )
        response.raise_for_status()
        response.encoding = response.apparent_encoding or "utf-8"
        soup = BeautifulSoup(response.text, "html.parser")
        paragraphs: list[str] = []
        for para in soup.find_all("p"):
            text = para.get_text(separator=" ", strip=True)
            if len(text) >= _MIN_PARAGRAPH_CHARS:
                paragraphs.append(text)
        return paragraphs
    except Exception as exc:
        logger.debug("Failed to fetch %s: %s", url, exc)
        return []
