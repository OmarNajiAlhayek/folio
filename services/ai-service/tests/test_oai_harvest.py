"""OAI-PMH parsing, text-quality gating, and running-header stripping.

No network: the protocol tests parse canned XML, which is where the real bugs
live (resumption tokens, deleted records, namespace handling).
"""

from __future__ import annotations

import xml.etree.ElementTree as ET

import pytest

from app.ml.exact_match.sources.oai_pmh import (
    OaiPmhClient,
    OaiPmhError,
    guess_oai_endpoints,
    parse_record,
)
from app.ml.exact_match.text_extract import strip_running_headers
from app.ml.exact_match.text_quality import TextQuality, assess_text

OAI = "http://www.openarchives.org/OAI/2.0/"
OAI_DC = "http://www.openarchives.org/OAI/2.0/oai_dc/"
DC = "http://purl.org/dc/elements/1.1/"


def record_xml(
    *,
    identifier: str = "oai:site:article/55",
    sets: tuple[str, ...] = ("engj:ART",),
    deleted: bool = False,
    identifiers: tuple[str, ...] = ("https://site/index.php/index/article/view/55",),
    language: str = "ar",
) -> ET.Element:
    status = ' status="deleted"' if deleted else ""
    set_xml = "".join(f"<setSpec>{s}</setSpec>" for s in sets)
    id_xml = "".join(f"<dc:identifier>{i}</dc:identifier>" for i in identifiers)
    metadata = (
        ""
        if deleted
        else f"""
        <metadata>
          <oai_dc:dc xmlns:oai_dc="{OAI_DC}" xmlns:dc="{DC}">
            <dc:title>عنوان البحث</dc:title>
            <dc:creator>Dr. Bassam</dc:creator>
            <dc:creator>د. بسام</dc:creator>
            <dc:description>short</dc:description>
            <dc:description>a considerably longer abstract that should win</dc:description>
            <dc:date>2021-06-26</dc:date>
            <dc:language>{language}</dc:language>
            {id_xml}
          </oai_dc:dc>
        </metadata>"""
    )
    return ET.fromstring(
        f"""<record xmlns="{OAI}">
          <header{status}>
            <identifier>{identifier}</identifier>
            <datestamp>2021-06-26T00:00:00Z</datestamp>
            {set_xml}
          </header>{metadata}
        </record>""",
    )


class TestRecordParsing:
    def test_parses_dublin_core(self) -> None:
        record = parse_record(record_xml())
        assert record is not None
        assert record.identifier == "oai:site:article/55"
        assert record.creators == ("Dr. Bassam", "د. بسام")
        assert record.authors == "Dr. Bassam, د. بسام"
        assert record.year == 2021
        assert record.language == "ar"

    def test_longest_description_wins(self) -> None:
        record = parse_record(record_xml())
        assert record is not None
        assert record.description.startswith("a considerably longer")

    def test_deleted_records_are_skipped(self) -> None:
        assert parse_record(record_xml(deleted=True)) is None

    def test_doi_is_separated_from_landing_url(self) -> None:
        record = parse_record(
            record_xml(
                identifiers=(
                    "https://site/index.php/index/article/view/55",
                    "https://doi.org/10.1234/abcd",
                ),
            ),
        )
        assert record is not None
        assert record.doi == "10.1234/abcd"
        assert record.landing_url.endswith("/article/view/55")
        assert record.source_ref == "doi:10.1234/abcd"

    def test_source_ref_falls_back_to_oai_identifier(self) -> None:
        record = parse_record(record_xml())
        assert record is not None
        assert record.source_ref == "oai:oai:site:article/55"


class TestArticleUrlRewrite:
    """Site-wide OJS endpoints emit /index/ URLs that redirect to a login page."""

    def test_rewrites_index_path_to_journal_path(self) -> None:
        record = parse_record(record_xml(sets=("engj:ART",)))
        assert record is not None
        assert record.journal_code == "engj"
        assert record.article_url == "https://site/index.php/engj/article/view/55"

    def test_rewrites_locale_prefixed_urls(self) -> None:
        record = parse_record(
            record_xml(identifiers=("https://site/index.php/index/ar/article/view/55",)),
        )
        assert record is not None
        assert record.article_url == "https://site/index.php/engj/ar/article/view/55"

    def test_leaves_already_correct_urls_alone(self) -> None:
        url = "https://site/index.php/engj/article/view/55"
        record = parse_record(record_xml(identifiers=(url,)))
        assert record is not None
        assert record.article_url == url

    def test_no_setspec_means_no_rewrite(self) -> None:
        record = parse_record(record_xml(sets=()))
        assert record is not None
        assert record.journal_code == ""
        assert record.article_url == record.landing_url


class TestProtocolErrors:
    def test_empty_result_codes_are_not_failures(self) -> None:
        root = ET.fromstring(
            f'<OAI-PMH xmlns="{OAI}"><error code="noRecordsMatch">none</error></OAI-PMH>',
        )
        assert OaiPmhClient._check_error(root) == "noRecordsMatch"

    def test_real_errors_raise(self) -> None:
        root = ET.fromstring(
            f'<OAI-PMH xmlns="{OAI}"><error code="badArgument">nope</error></OAI-PMH>',
        )
        with pytest.raises(OaiPmhError, match="badArgument"):
            OaiPmhClient._check_error(root)

    def test_rejects_nonsense_base_url(self) -> None:
        with pytest.raises(OaiPmhError):
            OaiPmhClient("not-a-url")


class TestEndpointGuessing:
    def test_site_wide_ojs_endpoint_is_offered(self) -> None:
        guesses = guess_oai_endpoints("https://journal.example.edu")
        assert "https://journal.example.edu/index.php/index/oai" in guesses

    def test_no_duplicates(self) -> None:
        guesses = guess_oai_endpoints("https://example.org")
        assert len(guesses) == len(set(guesses))


class TestTextQuality:
    def _arabic(self, repeats: int) -> str:
        sentence = "في هذا البحث تم دراسة تأثير العوامل على النتائج التي حصلنا عليها من التجربة "
        return sentence * repeats

    def _english(self, repeats: int) -> str:
        sentence = "in this paper we study the effect of the parameters on the results "
        return (sentence + "that we obtained ") * repeats

    def test_real_arabic_passes(self) -> None:
        assert assess_text(self._arabic(40)).quality is TextQuality.GOOD

    def test_real_english_passes(self) -> None:
        """English runs 25-30% short tokens naturally and must not be condemned."""
        report = assess_text(self._english(40))
        assert report.quality is TextQuality.GOOD
        assert report.short_token_ratio > 0.2

    def test_broken_font_encoding_is_rejected(self) -> None:
        # Shape of a real failure: valid Arabic code points spelling nothing.
        garbage = "إت ل ف لدايرس ل ةا لب ةع بةو ت ةويد ليةا سه اسلةا ترةةةاع فةةةس ت ظةةةير " * 30
        report = assess_text(garbage)
        assert report.quality is TextQuality.BROKEN
        assert not report.usable
        assert report.function_word_ratio < 0.03

    def test_short_text_is_not_judged(self) -> None:
        assert assess_text("كلمات قليلة جدا").quality is TextQuality.TOO_SHORT

    def test_usable_covers_good_and_suspect(self) -> None:
        assert assess_text(self._arabic(40)).usable

    def test_indexable_is_good_only(self) -> None:
        assert assess_text(self._arabic(40)).indexable
        garbage = "إت ل ف لدايرس ل ةا لب ةع بةو ت ةويد ليةا سه اسلةا ترةةةاع فةةةس ت ظةةةير " * 30
        assert not assess_text(garbage).indexable

    def test_letter_substituted_arabic_is_broken(self) -> None:
        """
        CMap substitution that keeps some function words (في/مع) but turns
        على→عمى and التسويق→التدهيق. Must not enter the corpus.
        """
        # Built from the real poisoned back-catalog row shape: enough surviving
        # particles to clear the old 3% function-word floor, plus the observed
        # letter map so substitution-rescue fires.
        garbled = (
            "يجفت يحه الجراسه الي تحجيج اثخ ابعاد التدعيق الجاخمي الخضا الػضيفي "
            "فخق العسل عمي اداره الازمات الرحيه مغ وجيه نطخ اشبا ومسخضي مدتذفي "
            "الاسج الجامعي بجمذق وقج تبشت الجراسه الفمدفه الػضعيه والاسمػب "
            "الاستشتاجي مع الاعتساد عمي الاستبانه كاداه لجسع البيانات "
            "اثر التدهيق الداخمي عمي اداره الازمات الرحيه دراسه حاله "
        ) * 40
        report = assess_text(garbled)
        assert report.quality is TextQuality.BROKEN
        assert report.substitution_rescue_ratio >= 0.02
        assert not report.indexable

    def test_composite_score_prefers_clean_over_garbled(self) -> None:
        clean = self._arabic(40)
        garbled = (
            "يجفت يحه الجراسه الي تحجيج اثخ ابعاد التدعيق الجاخمي عمي اداره "
            "الازمات الرحيه مغ وجيه نطخ مع في لا ما "
        ) * 40
        assert assess_text(clean).score > assess_text(garbled).score

    def test_unreadable_submission_raises_stable_code(self) -> None:
        from app.ml.exact_match.exact_match_service import ExactMatchService
        from app.ml.exact_match.types import UnreadableSubmissionTextError

        class _EmptyStore:
            def query_postings(self, *args, **kwargs):
                return []

            def get_documents(self, *args, **kwargs):
                return {}

        # Same shape as test_letter_substituted_arabic_is_broken.
        garbage = (
            "يجفت يحه الجراسه الي تحجيج اثخ ابعاد التدعيق الجاخمي الخضا الػضيفي "
            "فخق العسل عمي اداره الازمات الرحيه مغ وجيه نطخ اشبا ومسخضي مدتذفي "
            "الاسج الجامعي بجمذق وقج تبشت الجراسه الفمدفه الػضعيه والاسمػب "
            "الاستشتاجي مع الاعتساد عمي الاستبانه كاداه لجسع البيانات "
            "اثر التدهيق الداخمي عمي اداره الازمات الرحيه دراسه حاله "
        ) * 40
        assert assess_text(garbage).quality is TextQuality.BROKEN
        svc = ExactMatchService(_EmptyStore())  # type: ignore[arg-type]
        with pytest.raises(UnreadableSubmissionTextError) as exc:
            svc.detect(garbage)
        assert exc.value.args[0] == UnreadableSubmissionTextError.ERROR_CODE


class TestRunningHeaders:
    def test_strips_lines_repeated_across_pages(self) -> None:
        pages = [f"Journal of Things | Hallak\nbody text page {i}\nfooter line" for i in range(8)]
        text, removed = strip_running_headers(pages)
        assert "Journal of Things | Hallak" in removed
        assert "footer line" in removed
        assert "body text page 3" in text
        assert "Journal of Things" not in text

    def test_leaves_short_documents_alone(self) -> None:
        pages = ["header\nbody one", "header\nbody two"]
        text, removed = strip_running_headers(pages)
        assert removed == []
        assert text.count("header") == 2

    def test_keeps_unique_body_lines(self) -> None:
        pages = [f"hdr\nunique line {i}\nalso unique {i * 2}" for i in range(6)]
        text, removed = strip_running_headers(pages)
        assert removed == ["hdr"]
        for i in range(6):
            assert f"unique line {i}" in text
