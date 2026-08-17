"""Mistral document OCR: markdown cleanup, request shape, and engine routing.

No network. The API is stubbed, because what needs guarding here is our side of
the contract — that markup never reaches the fingerprints, that we never upload
more pages than the caller asked for (it is billed per page), and that a
document-native engine bypasses rasterization.
"""

from __future__ import annotations

import pytest

from app.ml.exact_match.ocr import (
    DocumentOcrEngine,
    MistralOcrEngine,
    TesseractEngine,
    markdown_to_text,
    ocr_pdf_bytes,
)
from app.ml.exact_match.text_extract import TextExtractionError


class TestMarkdownToText:
    def test_drops_image_placeholders(self) -> None:
        # These are the tokens that would otherwise be fingerprinted as if an
        # author had written them.
        assert "img-0" not in markdown_to_text("نص ![img-0.jpeg](img-0.jpeg) عربي")

    def test_drops_latex_math(self) -> None:
        cleaned = markdown_to_text(r"قبل $$E = mc^2$$ بعد")
        assert "mc^2" not in cleaned
        assert "قبل" in cleaned and "بعد" in cleaned

    def test_keeps_prose_dollar_amounts(self) -> None:
        # A naive $...$ rule eats the text between two prices.
        text = "The cost was $100 and $200 in total."
        assert markdown_to_text(text) == text

    def test_keeps_table_content_but_drops_divider(self) -> None:
        cleaned = markdown_to_text("| Year | Value |\n| :--: | :--: |\n| 2024 | 12 |")
        assert "2024" in cleaned and "Value" in cleaned
        assert "--" not in cleaned and "|" not in cleaned

    def test_strips_structural_markers(self) -> None:
        cleaned = markdown_to_text("# Heading\n\n- item\n\n> quote\n\n**bold** text")
        assert cleaned.splitlines()[0] == "Heading"
        for marker in ("#", "- ", "> ", "**"):
            assert marker not in cleaned

    def test_unwraps_links_keeping_label(self) -> None:
        assert markdown_to_text("see [the paper](http://x.y/z)") == "see the paper"

    def test_empty_input_is_safe(self) -> None:
        assert markdown_to_text("") == ""


class TestEngineRouting:
    def test_mistral_is_a_document_engine(self) -> None:
        assert isinstance(MistralOcrEngine(api_key="k"), DocumentOcrEngine)

    def test_page_engines_are_not(self) -> None:
        # Tesseract must keep going through the rasterizer.
        assert not isinstance(TesseractEngine(), DocumentOcrEngine)

    def test_document_engine_skips_rendering(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """A document engine must never trigger PDF rasterization."""

        def explode(*args: object, **kwargs: object) -> None:
            raise AssertionError("render_pdf_pages must not be called for a document engine")

        monkeypatch.setattr("app.ml.exact_match.ocr.render_pdf_pages", explode)

        engine = MistralOcrEngine(api_key="k")
        monkeypatch.setattr(
            type(engine),
            "pdf_to_pages",
            lambda self, data, *, max_pages=None: ["صفحة أولى", "صفحة ثانية"],
        )

        result = ocr_pdf_bytes(b"%PDF-1.4 fake", engine=engine)
        assert result.page_count == 2
        assert result.extractor == "ocr:mistral"
        assert "صفحة أولى" in result.text

    def test_empty_response_is_an_error_not_empty_text(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        """Silently returning "" would let the quality gate blame the document."""
        engine = MistralOcrEngine(api_key="k")
        monkeypatch.setattr(type(engine), "pdf_to_pages", lambda self, data, *, max_pages=None: [])
        with pytest.raises(TextExtractionError, match="no pages"):
            ocr_pdf_bytes(b"%PDF-1.4 fake", engine=engine)


class _Response:
    def __init__(self, status: int, payload: object = None, text: str = "") -> None:
        self.status_code = status
        self._payload = payload
        self.text = text

    def json(self) -> object:
        return self._payload


class TestRequestShape:
    def _capture(self, monkeypatch: pytest.MonkeyPatch, response: _Response) -> dict:
        sent: dict = {}

        def fake_post(url: str, **kwargs: object) -> _Response:
            sent["url"] = url
            sent.update(kwargs)  # type: ignore[arg-type]
            return response

        import requests

        monkeypatch.setattr(requests, "post", fake_post)
        return sent

    def test_requests_only_the_pages_asked_for(self, monkeypatch: pytest.MonkeyPatch) -> None:
        # Billed per page: uploading a 400-page book to read 3 pages is a bug.
        payload = {"pages": [{"index": 0, "markdown": "نص"}]}
        sent = self._capture(monkeypatch, _Response(200, payload))
        MistralOcrEngine(api_key="k").pdf_to_pages(b"%PDF-1.4", max_pages=3)
        assert sent["json"]["pages"] == [0, 1, 2]

    def test_omits_page_selector_when_reading_whole_document(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        sent = self._capture(monkeypatch, _Response(200, {"pages": []}))
        MistralOcrEngine(api_key="k").pdf_to_pages(b"%PDF-1.4")
        assert "pages" not in sent["json"]

    def test_orders_pages_by_reported_index(self, monkeypatch: pytest.MonkeyPatch) -> None:
        # Reading order is the whole point; never trust list order.
        payload = {"pages": [{"index": 1, "markdown": "ثانية"}, {"index": 0, "markdown": "أولى"}]}
        self._capture(monkeypatch, _Response(200, payload))
        pages = MistralOcrEngine(api_key="k").pdf_to_pages(b"%PDF-1.4")
        assert pages == ["أولى", "ثانية"]

    def test_client_error_is_not_retried(self, monkeypatch: pytest.MonkeyPatch) -> None:
        calls = {"n": 0}

        def fake_post(url: str, **kwargs: object) -> _Response:
            calls["n"] += 1
            return _Response(400, text="bad request")

        import requests

        monkeypatch.setattr(requests, "post", fake_post)
        with pytest.raises(TextExtractionError, match="HTTP 400"):
            MistralOcrEngine(api_key="k", max_retries=3).pdf_to_pages(b"%PDF-1.4")
        assert calls["n"] == 1

    def test_missing_key_fails_before_any_request(self, monkeypatch: pytest.MonkeyPatch) -> None:
        import requests

        monkeypatch.setattr(
            requests,
            "post",
            lambda *a, **k: pytest.fail("must not call the API without a key"),
        )
        with pytest.raises(TextExtractionError, match="MISTRAL_API_KEY"):
            MistralOcrEngine(api_key="").pdf_to_pages(b"%PDF-1.4")
