"""Plain-text extraction for corpus imports (PDF, DOCX, TXT).

Arabic PDFs are the hard case. Extractors differ sharply in whether they emit
logical or visual order and whether they emit Arabic presentation forms
(U+FE70-U+FEFF) instead of base letters, so this module tries them in descending
quality and reports which one won. Presentation forms are harmless downstream —
:func:`normalize_token` applies NFKC — but reversed *word* order is not
recoverable, so :func:`extraction_warnings` flags files worth eyeballing.

DOCX is unzipped with the stdlib rather than adding python-docx: a .docx is a zip
whose ``word/document.xml`` already carries the text in reading order.
"""

from __future__ import annotations

import logging
import re
import unicodedata
import zipfile
from dataclasses import dataclass
from pathlib import Path

logger = logging.getLogger(__name__)

SUPPORTED_SUFFIXES = frozenset({".pdf", ".docx", ".txt", ".md"})

_DOCX_PARAGRAPH = re.compile(rb"<w:p[ >].*?</w:p>", re.DOTALL)
_DOCX_TEXT = re.compile(rb"<w:t[^>]*>(.*?)</w:t>", re.DOTALL)
_XML_TAG = re.compile(rb"<[^>]+>")

_ARABIC_BLOCK = (0x0600, 0x06FF)
_PRESENTATION_BLOCKS = ((0xFB50, 0xFDFF), (0xFE70, 0xFEFF))


@dataclass(frozen=True)
class ExtractedText:
    text: str
    extractor: str
    page_count: int = 0
    pages: tuple[str, ...] = ()
    stripped_running_lines: tuple[str, ...] = ()

    @property
    def char_count(self) -> int:
        return len(self.text)


def strip_running_headers(
    pages: list[str],
    *,
    min_pages: int = 3,
    frequency: float = 0.3,
) -> tuple[str, list[str]]:
    """
    Drop lines that repeat across pages — running headers, footers, page numbers.

    PDF extraction is page-by-page, so this furniture interleaves into the text
    stream. It wrecks two things: it wastes fingerprints on text that carries no
    authorship signal, and it poisons query-passage selection (a passage picker
    happily grabs the header, which is identical on every page of the article).

    Returns the cleaned text and the lines removed, so importers can report them.
    """
    if len(pages) < min_pages:
        return "\n".join(pages), []

    counts: dict[str, int] = {}
    for page in pages:
        for line in {line.strip() for line in page.splitlines() if line.strip()}:
            counts[line] = counts.get(line, 0) + 1

    threshold = max(2, int(len(pages) * frequency))
    # A page number alone repeats with *different* text each page, so it never
    # trips the counter; the digits ride along inside the header line instead.
    running = {line for line, count in counts.items() if count >= threshold}
    if not running:
        return "\n".join(pages), []

    cleaned_pages = [
        "\n".join(line for line in page.splitlines() if line.strip() not in running)
        for page in pages
    ]
    return "\n".join(cleaned_pages), sorted(running)


class TextExtractionError(RuntimeError):
    """Raised when no available extractor could read the file."""


def _in_block(codepoint: int, block: tuple[int, int]) -> bool:
    return block[0] <= codepoint <= block[1]


def script_ratios(text: str) -> dict[str, float]:
    """Share of letters that are Arabic, Latin, or Arabic presentation forms."""
    arabic = latin = presentation = letters = 0
    for ch in text:
        if not ch.isalpha():
            continue
        letters += 1
        cp = ord(ch)
        if _in_block(cp, _ARABIC_BLOCK):
            arabic += 1
        elif any(_in_block(cp, block) for block in _PRESENTATION_BLOCKS):
            presentation += 1
        elif "LATIN" in unicodedata.name(ch, ""):
            latin += 1
    if letters == 0:
        return {"arabic": 0.0, "latin": 0.0, "presentation": 0.0}
    return {
        "arabic": arabic / letters,
        "latin": latin / letters,
        "presentation": presentation / letters,
    }


def extraction_warnings(result: ExtractedText, *, min_chars: int = 500) -> list[str]:
    """Human-readable quality flags for an extracted document."""
    warnings: list[str] = []
    if result.char_count < min_chars:
        warnings.append(
            f"only {result.char_count} characters extracted — likely a scanned PDF needing OCR",
        )
    ratios = script_ratios(result.text)
    if ratios["presentation"] > 0.2:
        warnings.append(
            f"{ratios['presentation']:.0%} Arabic presentation forms — "
            "normalization folds these, but check word order is not reversed",
        )
    if ratios["arabic"] < 0.05 and ratios["latin"] < 0.05:
        warnings.append("almost no recognizable letters — extraction probably failed")
    return warnings


def _finalize(pages: list[str], extractor: str, *, clean_running: bool) -> ExtractedText:
    if clean_running:
        text, removed = strip_running_headers(pages)
    else:
        text, removed = "\n".join(pages), []
    return ExtractedText(
        text=text,
        extractor=extractor,
        page_count=len(pages),
        pages=tuple(pages),
        stripped_running_lines=tuple(removed),
    )


def _extract_pdf_pymupdf(path: Path, *, clean_running: bool = True) -> ExtractedText | None:
    try:
        import fitz  # PyMuPDF
    except ImportError:
        return None
    with fitz.open(path) as doc:
        pages = [page.get_text("text") for page in doc]
    return _finalize(pages, "pymupdf", clean_running=clean_running)


def extract_pdf_bytes(data: bytes, *, clean_running: bool = True) -> ExtractedText:
    """
    Extract a PDF held in memory — no temp file.

    Used by the harvesters, which stream PDFs straight from HTTP and never need
    them on disk.
    """
    if not data.startswith(b"%PDF-"):
        raise TextExtractionError("Not a PDF (missing %PDF- magic bytes)")
    try:
        import fitz  # PyMuPDF
    except ImportError as err:
        raise TextExtractionError(
            'In-memory PDF extraction needs PyMuPDF. Run: pip install -e ".[corpus]"',
        ) from err
    with fitz.open(stream=data, filetype="pdf") as doc:
        pages = [page.get_text("text") for page in doc]
    return _finalize(pages, "pymupdf-bytes", clean_running=clean_running)


def _extract_pdf_pdfplumber(path: Path, *, clean_running: bool = True) -> ExtractedText | None:
    try:
        import pdfplumber
    except ImportError:
        return None
    with pdfplumber.open(path) as pdf:
        pages = [page.extract_text() or "" for page in pdf.pages]
    return _finalize(pages, "pdfplumber", clean_running=clean_running)


def _extract_pdf_pypdf(path: Path, *, clean_running: bool = True) -> ExtractedText | None:
    try:
        from pypdf import PdfReader
    except ImportError:
        return None
    reader = PdfReader(str(path))
    pages = [page.extract_text() or "" for page in reader.pages]
    return _finalize(pages, "pypdf", clean_running=clean_running)


def extract_pdf(path: Path, *, best_of: bool = True) -> ExtractedText:
    """
    Extract PDF text, keeping whichever backend produced the most readable result.

    Taking the *first* backend that returns any text is a trap: the extractors
    disagree, and not always in the same direction. On one file here pypdf scored
    0.071 where PyMuPDF managed 0.066; on another PyMuPDF scored 0.100 where
    pdfplumber returned garbage at 0.028. Scoring each and keeping the best costs
    two extra parses and recovers files that ordering alone would lose.

    It does not rescue a genuinely broken ``ToUnicode`` CMap — all three
    extractors fail together there, because the damage is in the file. That case
    needs :func:`app.ml.exact_match.ocr.ocr_pdf_bytes`.
    """
    from app.ml.exact_match.text_quality import assess_text

    attempts = (_extract_pdf_pymupdf, _extract_pdf_pdfplumber, _extract_pdf_pypdf)
    results: list[ExtractedText] = []
    last_error: Exception | None = None

    for attempt in attempts:
        try:
            result = attempt(path)
        except Exception as exc:  # a corrupt PDF should not stop the whole import
            last_error = exc
            logger.debug("PDF extractor %s failed on %s: %s", attempt.__name__, path.name, exc)
            continue
        if result is None or not result.text.strip():
            continue
        results.append(result)
        if not best_of:
            return result

    if not results:
        raise TextExtractionError(
            f"No PDF extractor could read {path.name}"
            + (f" (last error: {last_error})" if last_error else "")
            + ". Install PyMuPDF or pdfplumber, or OCR the file first.",
        )

    # Composite score (not function-word alone): letter-substituted Arabic can
    # still clear a raw function-word check and otherwise win best-of.
    best = max(results, key=lambda r: assess_text(r.text).score)
    if len(results) > 1:
        logger.debug("Chose %s for %s from %d extractors", best.extractor, path.name, len(results))
    return best


def extract_docx(path: Path) -> ExtractedText:
    """Read ``word/document.xml`` and join paragraphs with newlines."""
    try:
        with zipfile.ZipFile(path) as archive:
            xml = archive.read("word/document.xml")
    except (KeyError, zipfile.BadZipFile) as err:
        raise TextExtractionError(f"{path.name} is not a readable .docx") from err

    paragraphs: list[str] = []
    for block in _DOCX_PARAGRAPH.findall(xml):
        runs = _DOCX_TEXT.findall(block)
        joined = b"".join(_XML_TAG.sub(b"", run) for run in runs)
        text = joined.decode("utf-8", errors="replace").strip()
        if text:
            paragraphs.append(text)
    return ExtractedText(text="\n".join(paragraphs), extractor="docx-zip")


def extract_text(path: Path) -> ExtractedText:
    """Extract plain text from a supported corpus file."""
    suffix = path.suffix.lower()
    if suffix == ".pdf":
        return extract_pdf(path)
    if suffix == ".docx":
        return extract_docx(path)
    if suffix in {".txt", ".md"}:
        return ExtractedText(
            text=path.read_text(encoding="utf-8", errors="replace"),
            extractor="raw",
        )
    raise TextExtractionError(
        f"Unsupported file type {suffix!r}; expected one of {sorted(SUPPORTED_SUFFIXES)}",
    )
