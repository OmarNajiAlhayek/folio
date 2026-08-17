"""OCR fallback for PDFs whose text layer is unusable.

Needed because the DOCX shortcut only exists for our own journal. Harvesting
other institutions means taking whatever PDF they publish, and a large share of
Arabic academic PDFs carry a broken ``ToUnicode`` CMap — every extractor then
returns the same garbage, because the damage is in the file, not the reader.
Measured across three extractors on the same broken files: 0.011-0.029 function
words from all of them.

So this renders the page and reads the pixels, ignoring the text layer entirely.

The engine is pluggable on purpose, and the choice is settled by measurement
rather than opinion: ``scripts/ocr_recall_bench.py`` indexes an OCR pass as the
corpus copy of an article and then submits that article's clean text layer as a
perfect plagiarist, so the number it reports is recall — the share of a verbatim
copy still caught. Readability alone is not that number.

Accuracy matters more here than it does for search, because exact matching needs
whole k-grams: at word error rate ``p``, a k-gram survives with probability
``(1-p)^k``. At k=6 a 5% error rate keeps 74% of fingerprints; 15% keeps 38%.

Measured on the Damascus corpus (whole documents, k=6), scoring OCR against
each PDF's own text layer:

===========  ============  ==========
engine       recall (ar)   per page
===========  ============  ==========
mistral      26-42%        1.0 s
tesseract    ~20%          2.1 s
===========  ============  ==========

Script dominates. Latin-script articles retain 76-90% of a copy; Arabic ones
26-42%. Token alignment on the Arabic files shows ~18-20% of tokens altered —
mostly letter substitution, plus 2-4% merged words where a space is lost — and
``0.81^6`` is 28%, so recall in the thirties is the arithmetic working, not a
bug. Treat an OCR'd Arabic article as a *partial* corpus entry: it reliably
flags a wholesale copy and can miss a short one.

Two traps this bench had to grow guards against, both of which silently produce
a wrong number rather than an error:

- **A decayed reference.** One article scored 5.7% until the text layer it was
  judged against turned out to have half the real-word density of the OCR it
  was judging. ``ocr_recall_bench.py`` now voids a row whose reference falls
  below :data:`GROUND_TRUTH_LEXICON_FLOOR` of the best OCR.
- **A reference sharing the engine's pipeline.** Scoring Mistral against a
  Mistral reference returns exactly 100% on all 11 articles. That measures
  determinism, not accuracy, and is only meaningful if submissions are OCR'd
  by the same engine as the corpus — for DOCX submissions they are not.
"""

from __future__ import annotations

import logging
import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Protocol, runtime_checkable

from app.ml.exact_match.text_extract import (
    ExtractedText,
    TextExtractionError,
    strip_running_headers,
)

logger = logging.getLogger(__name__)

DEFAULT_DPI = 300
DEFAULT_LANG = "ara+eng"


class OcrEngine(Protocol):
    """Anything that turns a rendered page into text."""

    name: str

    def image_to_text(self, png_bytes: bytes, *, lang: str) -> str: ...


@runtime_checkable
class DocumentOcrEngine(Protocol):
    """
    An engine that reads a whole PDF itself instead of one rendered page.

    Hosted OCR generally works this way, and it is not merely a packaging
    detail: an engine that sees the whole document keeps column order and
    table structure across a page break, which per-page rasterization throws
    away before the engine ever runs. :func:`ocr_pdf_bytes` prefers this path
    when an engine offers it and skips rendering entirely.
    """

    name: str

    def pdf_to_pages(self, data: bytes, *, max_pages: int | None = None) -> list[str]: ...


def _resolve_env(name: str) -> str:
    """
    Read a key from the environment, falling back to the service ``.env``.

    pydantic-settings loads ``.env`` into :class:`app.config.Settings`, not into
    ``os.environ``, so a bare ``os.environ[...]`` here would find the key when
    the gRPC service runs and miss it in every script and test. Reading the file
    directly makes the engine behave the same in all three.
    """
    value = os.environ.get(name, "")
    if value:
        return value.strip()
    # app/ml/exact_match/ocr.py -> services/ai-service/.env
    env_file = Path(__file__).resolve().parents[3] / ".env"
    try:
        content = env_file.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""
    match = re.search(rf"^{re.escape(name)}=(.*)$", content, re.M)
    return match.group(1).strip().strip('"').strip("'") if match else ""


@dataclass
class TesseractEngine:
    """Local Tesseract. Free, offline, weakest on Arabic of the usual options."""

    name: str = "tesseract"
    # `--psm 6` treats the page as a uniform block, which suits single-column
    # academic pages far better than the default auto-segmentation.
    config: str = "--psm 6"

    def image_to_text(self, png_bytes: bytes, *, lang: str) -> str:
        try:
            import io

            import pytesseract
            from PIL import Image
        except ImportError as err:
            raise TextExtractionError(
                'Tesseract OCR needs pytesseract and Pillow. Run: pip install -e ".[ocr]"',
            ) from err
        with Image.open(io.BytesIO(png_bytes)) as image:
            return pytesseract.image_to_string(image, lang=lang, config=self.config)


@dataclass
class SuryaEngine:
    """
    Surya — a purpose-built OCR transformer, strong on Arabic and GPU-fast.

    Preferred over Tesseract where a GPU exists: Tesseract's Arabic accuracy tops
    out around 0.09 function words against real text's 0.11-0.13, and swapping
    ``tessdata_fast`` for ``tessdata_best`` does not move it (measured: 0.091 to
    0.095, at 2.7x the runtime).

    Preferred over a vision-language model because it transcribes rather than
    completes. A VLM asked to read a smudged word writes a *plausible* word; in a
    plagiarism corpus that means showing an editor source text the source never
    contained. Surya has no such failure mode.

    Models load once and are reused — first call pays the load cost.

    Targets Surya 0.17.x (torch-local). Surya 2+ needs a separate inference server
    and a different result schema — pin ``surya-ocr<0.20`` until that path lands.
    """

    name: str = "surya"
    _predictor: object | None = None
    _det_predictor: object | None = None

    def _get_predictor(self) -> object:
        """
        Build a recognition predictor across Surya's several API generations.

        Surya reorganized its entry points more than once (``run_ocr`` with
        explicit det/rec models, then ``RecognitionPredictor`` + ``DetectionPredictor``,
        then a ``FoundationPredictor``). Trying them newest-first keeps this
        working across whatever version pip resolves.
        """
        if self._predictor is not None:
            return self._predictor

        try:
            from surya.foundation import FoundationPredictor
            from surya.recognition import RecognitionPredictor

            self._predictor = RecognitionPredictor(FoundationPredictor())
            return self._predictor
        except ImportError:
            pass

        try:
            from surya.recognition import RecognitionPredictor

            self._predictor = RecognitionPredictor()
            return self._predictor
        except ImportError as err:
            raise TextExtractionError(
                "Surya OCR is not installed or its API is unrecognized. "
                "Run: pip install -e '.[ocr]'",
            ) from err

    def _get_det_predictor(self) -> object:
        if self._det_predictor is not None:
            return self._det_predictor
        try:
            from surya.detection import DetectionPredictor
        except ImportError as err:
            raise TextExtractionError(
                "Surya detection predictor missing. Run: pip install -e '.[ocr]'",
            ) from err
        self._det_predictor = DetectionPredictor()
        return self._det_predictor

    def image_to_text(self, png_bytes: bytes, *, lang: str) -> str:
        try:
            import io

            from PIL import Image
        except ImportError as err:
            raise TextExtractionError("Surya needs Pillow. Run: pip install pillow") from err

        predictor = self._get_predictor()
        with Image.open(io.BytesIO(png_bytes)) as image:
            page = image.convert("RGB")
            # 0.17 requires det_predictor (AssertionError if omitted). Newer APIs
            # may take images alone — try with detection first, then without.
            try:
                results = predictor(  # type: ignore[operator]
                    [page],
                    det_predictor=self._get_det_predictor(),
                )
            except TypeError:
                results = predictor([page])  # type: ignore[operator]

        return "\n".join(self._lines_of(results))

    @staticmethod
    def _lines_of(results: object) -> list[str]:
        lines: list[str] = []
        for result in results or []:  # type: ignore[union-attr]
            for line in getattr(result, "text_lines", []) or []:
                text = getattr(line, "text", "") or ""
                if text.strip():
                    lines.append(text)
        return lines


_MD_IMAGE = re.compile(r"!\[[^\]]*\]\([^)]*\)")
_MD_LINK = re.compile(r"\[([^\]]*)\]\([^)]*\)")
_MD_DISPLAY_MATH = re.compile(r"\$\$.*?\$\$", re.S)
# Inline math only when it carries a LaTeX command, so prose about "$100 and
# $200" is not eaten as if the dollars delimited a formula.
_MD_INLINE_MATH = re.compile(r"\$[^$\n]*\\[^$\n]*\$")
_MD_FENCE = re.compile(r"^\s*```.*$", re.M)
_MD_RULE = re.compile(r"^\s*([-*_])\1{2,}\s*$", re.M)
_MD_HEADING = re.compile(r"^\s{0,3}#{1,6}\s*", re.M)
_MD_BLOCKQUOTE = re.compile(r"^\s{0,3}>\s?", re.M)
_MD_LIST = re.compile(r"^\s{0,3}(?:[-*+]|\d{1,3}[.)])\s+", re.M)
_MD_TABLE_DIVIDER = re.compile(r"^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$", re.M)
_MD_EMPHASIS = re.compile(r"(\*{1,3}|_{1,3}|`+)")
_BLANK_RUN = re.compile(r"\n{3,}")


def markdown_to_text(markdown: str) -> str:
    """
    Reduce OCR markdown to the prose underneath it.

    Not cosmetic. Markup reaches two places that matter: the fingerprints, where
    ``![img-0.jpeg](img-0.jpeg)`` becomes tokens that no human author ever wrote
    and so can only break a k-gram or forge one, and ``retained_text``, which is
    the passage an editor is shown as evidence of copying. Leaving LaTeX and
    table pipes in it degrades matching and puts noise in front of a reviewer.

    Table *content* is kept — a results table is real text an author can copy —
    but the ``|---|---|`` divider rows are dropped, since they are pure layout.
    """
    text = _MD_IMAGE.sub(" ", markdown)
    text = _MD_DISPLAY_MATH.sub(" ", text)
    text = _MD_INLINE_MATH.sub(" ", text)
    text = _MD_LINK.sub(r"\1", text)
    text = _MD_FENCE.sub("", text)
    text = _MD_RULE.sub("", text)
    text = _MD_TABLE_DIVIDER.sub("", text)
    text = _MD_HEADING.sub("", text)
    text = _MD_BLOCKQUOTE.sub("", text)
    text = _MD_LIST.sub("", text)
    text = text.replace("|", " ")
    text = _MD_EMPHASIS.sub("", text)
    lines = [line.strip() for line in text.splitlines()]
    return _BLANK_RUN.sub("\n\n", "\n".join(lines)).strip()


@dataclass
class MistralOcrEngine:
    """
    Mistral's hosted document OCR (``mistral-ocr-latest``).

    Document-native: the PDF goes up whole and comes back as markdown per page,
    so no rasterization happens locally and page layout survives.

    Unlike a general vision-language model this is a transcription model, which
    is the property that matters for a plagiarism corpus — a model that
    *completes* text would invent a plausible word for a smudged one, and the
    editor would be shown source text the source never contained. The same
    reasoning is why Surya is preferred over a VLM above.

    Costs money per page, so it is not returned by :func:`available_engines`
    unless ``MISTRAL_API_KEY`` is set. ``lang`` is accepted and ignored: the
    model detects script itself, and the parameter keeps the signature
    interchangeable with the local engines.
    """

    name: str = "mistral"
    model: str = "mistral-ocr-latest"
    endpoint: str = "https://api.mistral.ai/v1/ocr"
    timeout: float = 180.0
    max_retries: int = 3
    api_key: str = field(default_factory=lambda: _resolve_env("MISTRAL_API_KEY"))

    def pdf_to_pages(self, data: bytes, *, max_pages: int | None = None) -> list[str]:
        """Upload one PDF and return its pages as plain text, in order."""
        import base64
        import time

        try:
            import requests
        except ImportError as err:
            raise TextExtractionError(
                'Mistral OCR needs requests. Run: pip install -e ".[corpus]"',
            ) from err

        if not self.api_key:
            raise TextExtractionError(
                "MISTRAL_API_KEY is not set (checked the environment and "
                "services/ai-service/.env)",
            )

        payload: dict[str, object] = {
            "model": self.model,
            "document": {
                "type": "document_url",
                "document_url": "data:application/pdf;base64,"
                + base64.b64encode(data).decode("ascii"),
            },
            # Billing is per page, so never upload more than the caller asked
            # for. The API numbers pages from zero.
            "include_image_base64": False,
        }
        if max_pages is not None:
            payload["pages"] = list(range(max_pages))

        last_error = ""
        for attempt in range(1, self.max_retries + 1):
            try:
                response = requests.post(
                    self.endpoint,
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                    timeout=self.timeout,
                )
            except requests.RequestException as exc:
                last_error = f"{type(exc).__name__}: {exc}"
                response = None

            if response is not None:
                if response.status_code == 200:
                    return self._pages_of(response.json())
                # 429 is a rate limit and 5xx is theirs, not ours; both are
                # worth another try. A 4xx is a bad request and never will be.
                last_error = f"HTTP {response.status_code}: {response.text[:300]}"
                if response.status_code != 429 and response.status_code < 500:
                    break

            if attempt < self.max_retries:
                delay = 2.0 * attempt
                logger.warning(
                    "Mistral OCR attempt %d/%d failed (%s); retrying in %.0fs",
                    attempt,
                    self.max_retries,
                    last_error,
                    delay,
                )
                time.sleep(delay)

        raise TextExtractionError(f"Mistral OCR failed: {last_error}")

    @staticmethod
    def _pages_of(body: dict) -> list[str]:
        """Order by the API's own page index — never trust response ordering."""
        pages = body.get("pages") or []
        ordered = sorted(pages, key=lambda page: page.get("index", 0))
        return [markdown_to_text(page.get("markdown", "") or "") for page in ordered]

    def image_to_text(self, png_bytes: bytes, *, lang: str) -> str:
        """Not supported: this engine reads documents, not loose pages."""
        raise TextExtractionError(
            "MistralOcrEngine reads whole PDFs — call pdf_to_pages / ocr_pdf_bytes",
        )


def available_engines() -> list[OcrEngine]:
    """Every OCR engine usable on this machine, best-first."""
    engines: list[OcrEngine] = []
    # Hosted and billed per page, so it appears only when deliberately
    # configured — otherwise every bench run would quietly spend money.
    if _resolve_env("MISTRAL_API_KEY"):
        engines.append(MistralOcrEngine())
    try:
        import surya  # noqa: F401

        engines.append(SuryaEngine())
    except ImportError:
        pass
    try:
        import pytesseract  # noqa: F401

        engines.append(TesseractEngine())
    except ImportError:
        pass
    return engines


def render_pdf_pages(
    data: bytes,
    *,
    dpi: int = DEFAULT_DPI,
    max_pages: int | None = None,
) -> list[bytes]:
    """Rasterize a PDF to PNG pages, bypassing the text layer completely."""
    try:
        import fitz  # PyMuPDF
    except ImportError as err:
        raise TextExtractionError(
            'Rendering needs PyMuPDF. Run: pip install -e ".[corpus]"',
        ) from err

    pages: list[bytes] = []
    with fitz.open(stream=data, filetype="pdf") as doc:
        for index, page in enumerate(doc):
            if max_pages is not None and index >= max_pages:
                break
            pages.append(page.get_pixmap(dpi=dpi).tobytes("png"))
    return pages


def ocr_pdf_bytes(
    data: bytes,
    *,
    engine: OcrEngine | None = None,
    lang: str = DEFAULT_LANG,
    dpi: int = DEFAULT_DPI,
    max_pages: int | None = None,
    clean_running: bool = True,
) -> ExtractedText:
    """
    OCR a PDF held in memory.

    Slow by nature — budget seconds per page — so callers should reach for this
    only after the text layer has been judged unusable.
    """
    ocr = engine or TesseractEngine()

    if isinstance(ocr, DocumentOcrEngine):
        # Document-native engine: hand it the file and skip rasterizing. A
        # failure here is total rather than per-page, so it propagates instead
        # of degrading to empty pages the quality gate would silently reject.
        pages = ocr.pdf_to_pages(data, max_pages=max_pages)
        if not pages:
            raise TextExtractionError(f"{ocr.name} returned no pages")
    else:
        images = render_pdf_pages(data, dpi=dpi, max_pages=max_pages)
        if not images:
            raise TextExtractionError("PDF rendered to zero pages")

        pages = []
        for number, png in enumerate(images, 1):
            try:
                pages.append(ocr.image_to_text(png, lang=lang))
            except TextExtractionError:
                raise
            except Exception as exc:
                logger.warning("OCR failed on page %d: %s", number, exc)
                pages.append("")

    if clean_running:
        text, removed = strip_running_headers(pages)
    else:
        text, removed = "\n".join(pages), []

    return ExtractedText(
        text=text,
        extractor=f"ocr:{ocr.name}",
        page_count=len(pages),
        pages=tuple(pages),
        stripped_running_lines=tuple(removed),
    )


def recover_text(
    data: bytes,
    existing: ExtractedText | None = None,
    *,
    engine: OcrEngine | None = None,
    lang: str = DEFAULT_LANG,
    dpi: int = DEFAULT_DPI,
    max_pages: int | None = None,
    force: bool = False,
) -> tuple[ExtractedText, str]:
    """
    Return the most readable text available for a PDF, OCR-ing only if needed.

    Returns ``(text, how)`` where ``how`` is ``"text-layer"``, ``"ocr"``,
    ``"ocr-rejected"``, or ``"ocr-forced"``. OCR normally runs only when the
    text layer is judged BROKEN, and its output is judged by the same gate — a
    bad OCR pass must not be trusted just because it was expensive.

    ``force`` OCRs every PDF and keeps the result even where the text layer
    passed. That is not about per-document quality but about *uniformity*: exact
    matching compares a submission against the corpus, so what costs recall is
    the two sides having been extracted by different pipelines, each with its own
    errors. Mixing text-layer and OCR documents in one corpus guarantees that
    mismatch; extracting everything the same way lets the errors cancel. Measured
    on this corpus, OCR also beat the text layer on real-word density in every
    Arabic article tested (0.203/0.186, 0.172/0.157, 0.215/0.105), so the
    uniformity is not bought at the cost of accuracy.
    """
    from app.ml.exact_match.text_extract import extract_pdf_bytes
    from app.ml.exact_match.text_quality import TextQuality, assess_text

    if existing is None:
        existing = extract_pdf_bytes(data)

    layer_quality = assess_text(existing.text)

    if force:
        forced = ocr_pdf_bytes(data, engine=engine, lang=lang, dpi=dpi, max_pages=max_pages)
        if assess_text(forced.text).score < layer_quality.score:
            # Kept anyway — a corpus split across two extractors is worse than
            # one uniformly slightly-worse extractor — but this is worth seeing.
            logger.warning(
                "Forced OCR scored below the text layer; keeping OCR for corpus "
                "uniformity (extractor was %s)",
                existing.extractor,
            )
        return forced, "ocr-forced"

    if layer_quality.quality is not TextQuality.BROKEN:
        return existing, "text-layer"

    logger.info("Text layer unusable (%s); falling back to OCR", layer_quality.reason)
    recovered = ocr_pdf_bytes(data, engine=engine, lang=lang, dpi=dpi, max_pages=max_pages)
    ocr_quality = assess_text(recovered.text)

    if ocr_quality.score <= layer_quality.score:
        # OCR did no better — keep the original so the caller's gate rejects it
        # rather than silently indexing worse text.
        return existing, "ocr-rejected"
    return recovered, "ocr"
