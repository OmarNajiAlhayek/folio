"""Arabic text normalization for web similarity."""

from __future__ import annotations

import re

from pyarabic.araby import strip_tashkeel

_farasa_segmenter = None


def _get_farasa_segmenter():
    global _farasa_segmenter
    if _farasa_segmenter is None:
        from farasa.pos import FarasaPOSTagger

        _farasa_segmenter = FarasaPOSTagger(interactive=True)
    return _farasa_segmenter


def clean_text(text: str) -> str:
    text = strip_tashkeel(text)
    text = re.sub(r"[^\w\s]", "", text)
    tagged = _get_farasa_segmenter().tag(text)
    return " ".join(word.split("/")[0] for word in tagged.split())
