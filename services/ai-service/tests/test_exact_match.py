"""Exact-overlap detection: normalization, winnowing, segmentation, matching.

No database required — detection runs against an in-memory store that implements
the handful of methods :class:`ExactMatchService` actually calls.
"""

from __future__ import annotations

import random

import pytest

from app.ml.exact_match.arabic_normalize import (
    normalize_text,
    normalize_token,
    snippet_for_span,
    tokenize,
)
from app.ml.exact_match.config import ExactMatchConfig
from app.ml.exact_match.corpus_store import IndexResult, Posting, StoredDocument, content_digest
from app.ml.exact_match.exact_match_service import ExactMatchService
from app.ml.exact_match.segmentation import (
    find_reference_section,
    quote_spans,
    strip_reference_section,
)
from app.ml.exact_match.types import CorpusDocument, SourceKind
from app.ml.exact_match.winnow import fingerprint, shingle_hashes, token_hash, winnow

# --------------------------------------------------------------- normalization


class TestArabicNormalize:
    def test_folds_orthographic_variants(self) -> None:
        # Same word, four spellings an author or an OCR pass might produce.
        assert normalize_token("الأولى") == normalize_token("الاولي")
        assert normalize_token("مكتبة") == normalize_token("مكتبه")
        assert normalize_token("مسؤول") == normalize_token("مسوول")

    def test_strips_diacritics_and_tatweel(self) -> None:
        assert normalize_token("الــعِلْمِيَّة") == normalize_token("العلمية")

    def test_folds_arabic_indic_digits(self) -> None:
        assert normalize_token("٢٠٢٤") == "2024"
        assert normalize_token("۲۰۲۴") == "2024"

    def test_diacritics_do_not_split_tokens(self) -> None:
        # `\w` does not match combining marks; a naive tokenizer would emit
        # several fragments per word here.
        assert len(tokenize("قَالَ البَاحِثُ")) == 2

    def test_offsets_index_the_original_text(self) -> None:
        text = "بحث علمي مهم"
        tokens = tokenize(text)
        assert [text[t.start : t.end] for t in tokens] == ["بحث", "علمي", "مهم"]

    def test_snippet_slices_original_text(self) -> None:
        text = "المقدمة تشرح الهدف من البحث"
        tokens = tokenize(text)
        assert snippet_for_span(text, tokens, 1, 3) == "تشرح الهدف"

    def test_punctuation_only_tokens_disappear(self) -> None:
        assert normalize_text("... ، ؛ !") == ""

    def test_latin_is_case_folded(self) -> None:
        assert normalize_text("Structural  ANALYSIS") == "structural analysis"

    def test_tokenize_normalized_texts_match_normalize_text_split(self) -> None:
        """Fingerprint word_pos stays aligned when detect re-tokenizes retained text.

        ``[t.text for t in tokenize(original)]`` must equal
        ``normalize_text(original).split()`` element-for-element — otherwise every
        stored ``corpus_fingerprints.word_pos`` silently points at the wrong token.
        """
        original = (
            "أصدر المشرع السوري قانوناً جديداً لحماية المستهلك. "
            "حاول المشرع من خلال هذا القانون أن يوفر الحماية الجزائية "
            "للمستهلك في مواجهة الممارسات الضارة. "
            "وتجد الإنابة التشريعية مكانها الرحب في القانون رقم 14 لعام 2015.\n"
            "----- ..... -----\n"
            "على وفق المادة 37 من القانون، فرض حد أدنى من العناصر.\n"
            "مكتبة\x00المستهلك"  # NUL scrubbed to space before index; still alnum-safe
        )
        scrubbed = original.replace("\x00", " ")
        texts = [t.text for t in tokenize(scrubbed)]
        joined = normalize_text(scrubbed).split()
        assert texts == joined
        assert len(texts) >= 40


# ------------------------------------------------------------------ winnowing


class TestWinnow:
    def test_token_hash_is_stable_across_processes(self) -> None:
        # Hard-coded on purpose: a stored corpus is unmatchable if this drifts.
        assert token_hash("folio") == token_hash("folio")
        assert token_hash("folio") != token_hash("oilof")
        assert 0 <= token_hash("folio") < (1 << 61) - 1

    def test_shingle_count(self) -> None:
        words = [f"w{i}" for i in range(10)]
        assert len(shingle_hashes(words, 6)) == 5
        assert shingle_hashes(words[:3], 6) == []

    def test_rolling_hash_matches_recomputation(self) -> None:
        words = [f"w{i % 7}" for i in range(50)]
        rolled = shingle_hashes(words, 5)
        for start, value in enumerate(rolled):
            assert value == shingle_hashes(words[start : start + 5], 5)[0]

    def test_identical_regions_select_identical_positions(self) -> None:
        shared = [f"s{i}" for i in range(40)]
        left = [f"a{i}" for i in range(30)] + shared
        right = [f"b{i}" for i in range(11)] + shared

        cfg = ExactMatchConfig()
        left_fp = {h for h, _ in fingerprint(left, cfg)}
        right_fp = {h for h, _ in fingerprint(right, cfg)}
        assert left_fp & right_fp

    @pytest.mark.parametrize("seed", [1, 2, 3, 4, 5])
    def test_guarantee_threshold_holds(self, seed: int) -> None:
        """Any shared run of k + w - 1 tokens must share at least one kept hash."""
        rng = random.Random(seed)
        vocab = [f"v{i}" for i in range(500)]
        cfg = ExactMatchConfig()
        shared = [rng.choice(vocab) for _ in range(cfg.guarantee_tokens())]

        def noise(n: int) -> list[str]:
            return [rng.choice(vocab) for _ in range(n)]

        left = noise(80) + shared + noise(60)
        right = noise(25) + shared + noise(90)

        left_fp = {h for h, _ in fingerprint(left, cfg)}
        right_fp = {h for h, _ in fingerprint(right, cfg)}
        assert left_fp & right_fp

    def test_density_is_about_two_over_w_plus_one(self) -> None:
        rng = random.Random(11)
        vocab = [f"v{i}" for i in range(500)]
        words = [rng.choice(vocab) for _ in range(4000)]
        cfg = ExactMatchConfig()

        kept = len(fingerprint(words, cfg))
        total = len(words) - cfg.k_gram + 1
        assert 0.7 < (kept / total) / (2 / (cfg.window + 1)) < 1.4

    def test_winnow_emits_each_selection_once(self) -> None:
        hashes = [5, 5, 5, 5, 5, 5]
        assert len(winnow(hashes, 3)) < len(hashes)


# --------------------------------------------------------------- segmentation


class TestSegmentation:
    def test_finds_arabic_reference_heading(self) -> None:
        body = "مقدمة البحث\n" * 40
        text = body + "\nالمراجع\n1. مصدر أول\n2. مصدر ثان\n"
        split = strip_reference_section(text)
        assert "مصدر أول" not in split.body
        assert split.references_start is not None

    def test_finds_english_reference_heading(self) -> None:
        text = "Body paragraph.\n" * 40 + "\nReferences\n1. Someone (2020).\n"
        assert "Someone" not in strip_reference_section(text).body

    def test_ignores_heading_in_the_first_half(self) -> None:
        text = "المراجع\n" + ("نص الدراسة\n" * 80)
        assert find_reference_section(text) is None

    def test_ignores_a_sentence_that_merely_mentions_references(self) -> None:
        long_line = "راجع الباحث المراجع السابقة قبل صياغة الفرضية الأساسية للدراسة الحالية"
        text = ("مقدمة\n" * 40) + long_line + "\n"
        assert find_reference_section(text) is None

    def test_takes_the_last_heading(self) -> None:
        text = (
            ("نص\n" * 40) + "المراجع العربية\nمصدر\n" + ("حشو\n" * 5) + "المراجع الأجنبية\nSource\n"
        )
        split = strip_reference_section(text)
        assert "Source" not in split.body

    def test_quote_spans_cover_guillemets(self) -> None:
        text = "قال الباحث «هذا اقتباس حرفي» ثم أكمل"
        spans = quote_spans(text)
        assert len(spans) == 1
        assert "اقتباس" in text[spans[0][0] : spans[0][1]]

    def test_unclosed_quote_is_ignored(self) -> None:
        assert quote_spans("قال «بلا إغلاق") == []

    def test_overlapping_styles_merge(self) -> None:
        text = '«a "b" c»'
        assert len(quote_spans(text)) == 1


# ------------------------------------------------------- in-memory test double


class FakeCorpusStore:
    """Minimal stand-in implementing only what ExactMatchService calls."""

    def __init__(self) -> None:
        self._docs: dict[str, StoredDocument] = {}
        self._postings: list[Posting] = []
        self._common: set[int] = set()
        self._next_id = 1

    def upsert_document(
        self,
        document: CorpusDocument,
        *,
        fingerprints: list[tuple[int, int]],
        token_count: int,
        retained_text: str | None,
        content_hash: str,
        skip_if_unchanged: bool = True,
    ) -> IndexResult:
        doc_id = f"doc-{self._next_id}"
        self._next_id += 1
        self._docs[doc_id] = StoredDocument(
            doc_id=doc_id,
            source_kind=document.source_kind,
            source_ref=document.source_ref,
            title=document.title,
            source_url=document.source_url,
            submission_id=document.submission_id,
            token_count=token_count,
            retained_text=retained_text,
            content_hash=content_hash,
        )
        for hash_value, word_pos in fingerprints:
            self._postings.append(Posting(doc_id=doc_id, hash=hash_value, word_pos=word_pos))
        return IndexResult(
            doc_id=doc_id,
            token_count=token_count,
            fingerprint_count=len(fingerprints),
        )

    def query_postings(
        self,
        hashes: list[int],
        *,
        max_postings_per_hash: int,
        exclude_doc_ids: list[str] | None = None,
        exclude_submission_ids: list[str] | None = None,
        source_kinds: list[SourceKind] | None = None,
    ) -> list[Posting]:
        wanted = set(hashes) - self._common
        excluded_docs = set(exclude_doc_ids or ())
        excluded_subs = set(exclude_submission_ids or ())
        out: list[Posting] = []
        for posting in self._postings:
            if posting.hash not in wanted or posting.doc_id in excluded_docs:
                continue
            doc = self._docs[posting.doc_id]
            if doc.submission_id and doc.submission_id in excluded_subs:
                continue
            out.append(posting)
        return out

    def get_documents(self, doc_ids: list[str], *, with_text: bool) -> dict[str, StoredDocument]:
        return {
            doc_id: (
                self._docs[doc_id]
                if with_text
                else StoredDocument(**{**self._docs[doc_id].__dict__, "retained_text": None})
            )
            for doc_id in doc_ids
            if doc_id in self._docs
        }

    def filter_common_hashes(self, hashes: list[int]) -> set[int]:
        return {h for h in hashes if h in self._common}

    def refresh_common_hashes(self, *, doc_ratio: float, min_docs: int, min_doc_freq: int) -> int:
        if len(self._docs) < min_docs:
            self._common = set()
            return 0
        threshold = max(min_doc_freq, round(len(self._docs) * doc_ratio))
        freq: dict[int, set[str]] = {}
        for posting in self._postings:
            freq.setdefault(posting.hash, set()).add(posting.doc_id)
        self._common = {h for h, docs in freq.items() if len(docs) >= threshold}
        return len(self._common)

    def mark_common(self, hashes: set[int]) -> None:
        self._common = hashes


def make_text(word_count: int, *, seed: int = 0, prefix: str = "w") -> str:
    """Build filler that still clears the submission readability gate.

    Latin ``w123`` tokens score as BROKEN (no Arabic function words). Mix in a
    closed Arabic function/lexicon set so detect tests exercise matching, not
    the unreadable-submission path.
    """
    rng = random.Random(seed)
    arabic = (
        "في من على هذا هذه التي الذي أن إن مع عن كما قد لا ما بين كل عند بعد "
        "ذلك حيث إلى أو ثم لكن حتى هو هي كان كانت يكون له لها به بها "
        "دراسة بحث نتائج تحليل منهج عينة بيانات نظرية تطبيق جامعة مجلة "
        "مقالة خلاصة ملخص مقدمة خاتمة تأثير علاقة عوامل مستوى دور أهمية"
    ).split()
    # Keep a distinct prefix so different seeds / roles do not accidentally share
    # long identical runs (which would inflate overlap in negative cases).
    vocab = [f"{prefix}{i}" for i in range(200)] + arabic
    return " ".join(rng.choice(vocab) for _ in range(word_count))


# ------------------------------------------------------------------- matching


class TestExactMatchService:
    def _service(self) -> tuple[ExactMatchService, FakeCorpusStore]:
        store = FakeCorpusStore()
        return ExactMatchService(store), store  # type: ignore[arg-type]

    def test_finds_a_copied_passage(self) -> None:
        service, _ = self._service()
        stolen = make_text(60, seed=1, prefix="s")
        source = f"{make_text(200, seed=2)} {stolen} {make_text(200, seed=3)}"
        service.index_document(
            CorpusDocument(source_kind=SourceKind.BACK_CATALOG, source_ref="a.pdf", title="A"),
            source,
        )

        report = service.detect(f"{make_text(150, seed=4)} {stolen} {make_text(150, seed=5)}")

        assert len(report.documents) == 1
        overlap = report.documents[0]
        assert overlap.title == "A"
        # Verification extends the run to the full copied passage.
        assert overlap.matched_tokens >= 55
        assert report.overall_ratio > 0.1

    def test_clean_submission_reports_nothing(self) -> None:
        service, _ = self._service()
        service.index_document(
            CorpusDocument(source_kind=SourceKind.BACK_CATALOG, source_ref="a.pdf"),
            make_text(400, seed=10),
        )
        report = service.detect(make_text(400, seed=99, prefix="z"))
        assert report.documents == []
        assert report.matched_tokens == 0

    def test_short_overlap_is_below_the_floor(self) -> None:
        service, _ = self._service()
        shared = make_text(6, seed=7, prefix="q")
        service.index_document(
            CorpusDocument(source_kind=SourceKind.BACK_CATALOG, source_ref="a.pdf"),
            f"{make_text(200, seed=11)} {shared} {make_text(200, seed=12)}",
        )
        report = service.detect(f"{make_text(200, seed=13)} {shared} {make_text(200, seed=14)}")
        assert report.documents == []

    def test_the_same_article_from_two_sources_is_reported_once(self) -> None:
        """
        Real corpora hold the same paper twice: the journal's own PDF and the
        OAI-PMH harvest of the same issue. Reporting both tells an editor that
        one copied article was plagiarised from two places.
        """
        service, _ = self._service()
        article = make_text(500, seed=21)
        service.index_document(
            CorpusDocument(
                source_kind=SourceKind.BACK_CATALOG,
                source_ref="issue-12.pdf",
                title="From the journal PDF",
            ),
            article,
        )
        service.index_document(
            CorpusDocument(
                source_kind=SourceKind.EXTERNAL_OA,
                source_ref="oai:journal:12",
                title="From the OAI harvest",
            ),
            article,
            store_text=False,
        )

        report = service.detect(article)

        assert len(report.documents) == 1, (
            f"one article reported as {len(report.documents)} sources: "
            f"{[d.title for d in report.documents]}"
        )
        # The survivor must be the copy that can quote the matched passage.
        assert report.documents[0].title == "From the journal PDF"
        assert report.overall_ratio > 0.95

    def test_distinct_articles_are_still_reported_separately(self) -> None:
        """The collapse keys on identical text, so it must not merge two papers."""
        service, _ = self._service()
        stolen = make_text(80, seed=31, prefix="s")
        for ref, seed in (("a.pdf", 32), ("b.pdf", 33)):
            service.index_document(
                CorpusDocument(source_kind=SourceKind.BACK_CATALOG, source_ref=ref, title=ref),
                f"{make_text(200, seed=seed)} {stolen} {make_text(200, seed=seed + 100)}",
            )

        report = service.detect(f"{make_text(150, seed=40)} {stolen} {make_text(150, seed=41)}")

        assert {d.title for d in report.documents} == {"a.pdf", "b.pdf"}

    def test_one_edited_word_does_not_hide_the_rest_of_the_copy(self) -> None:
        """
        Verification must return every identical stretch, not the longest one.

        Hits that share a diagonal and sit within ``max_gap_tokens`` merge into a
        single candidate, so a copy broken by one edit arrives as one candidate
        containing two stretches. Reporting only the longer one would halve the
        overlap of a document that was copied whole.
        """
        service, _ = self._service()
        words = make_text(400, seed=51, prefix="v").split()
        service.index_document(
            CorpusDocument(source_kind=SourceKind.BACK_CATALOG, source_ref="a.pdf"),
            " ".join(words),
        )

        edited = list(words)
        edited[200] = "swapped"
        report = service.detect(" ".join(edited))

        assert len(report.documents) == 1
        overlap = report.documents[0]
        assert overlap.matched_tokens >= 390, "only one side of the edit was reported"
        assert len(overlap.spans) >= 2

    def test_light_paraphrase_still_reports_most_of_the_copy(self) -> None:
        """One word changed every 20 leaves 19-token runs, over the 13-token floor."""
        service, _ = self._service()
        words = make_text(1000, seed=52, prefix="p").split()
        service.index_document(
            CorpusDocument(source_kind=SourceKind.BACK_CATALOG, source_ref="a.pdf"),
            " ".join(words),
        )

        edited = list(words)
        for i in range(19, len(edited), 20):
            edited[i] = f"edit{i}"

        assert service.detect(" ".join(edited)).overall_ratio > 0.85

    def test_heavy_paraphrase_stays_under_the_floor(self) -> None:
        """The counterpart: recovering more runs must not lower the noise floor."""
        service, _ = self._service()
        words = make_text(1000, seed=53, prefix="p").split()
        service.index_document(
            CorpusDocument(source_kind=SourceKind.BACK_CATALOG, source_ref="a.pdf"),
            " ".join(words),
        )

        edited = list(words)
        for i in range(9, len(edited), 10):  # 9-token runs, under min_match_tokens
            edited[i] = f"edit{i}"

        assert service.detect(" ".join(edited)).matched_tokens == 0

    def test_reference_list_is_not_matched(self) -> None:
        service, _ = self._service()
        references = "\nالمراجع\n" + make_text(80, seed=21, prefix="r")
        service.index_document(
            CorpusDocument(source_kind=SourceKind.BACK_CATALOG, source_ref="a.pdf"),
            make_text(300, seed=22) + references,
        )
        report = service.detect(make_text(300, seed=23, prefix="x") + references)
        assert report.documents == []
        assert report.reference_tokens_skipped > 0

    def test_stoplisted_boilerplate_is_ignored(self) -> None:
        service, store = self._service()
        boilerplate = make_text(60, seed=31, prefix="b")
        service.index_document(
            CorpusDocument(source_kind=SourceKind.BACK_CATALOG, source_ref="a.pdf"),
            f"{make_text(200, seed=32)} {boilerplate}",
        )

        submission = f"{make_text(200, seed=33, prefix='y')} {boilerplate}"
        assert service.detect(submission).documents  # matched before stoplisting

        words = [t.text for t in tokenize(boilerplate)]
        store.mark_common({h for h, _ in fingerprint(words, service.config)})
        assert service.detect(submission).documents == []

    def test_excluded_submission_does_not_self_match(self) -> None:
        service, _ = self._service()
        text = make_text(400, seed=41)
        service.index_document(
            CorpusDocument(
                source_kind=SourceKind.FOLIO_SUBMISSION,
                source_ref="sub-1",
                submission_id="11111111-1111-4111-8111-111111111111",
            ),
            text,
        )
        report = service.detect(
            text,
            exclude_submission_ids=["11111111-1111-4111-8111-111111111111"],
        )
        assert report.documents == []

    def test_quoted_overlap_is_flagged_not_hidden(self) -> None:
        service, _ = self._service()
        quoted = make_text(40, seed=51, prefix="c")
        service.index_document(
            CorpusDocument(source_kind=SourceKind.BACK_CATALOG, source_ref="a.pdf"),
            f"{make_text(200, seed=52)} {quoted} {make_text(100, seed=53)}",
        )

        report = service.detect(f"{make_text(150, seed=54)} «{quoted}» {make_text(150, seed=55)}")
        assert len(report.documents) == 1
        assert any(span.quoted for span in report.documents[0].spans)
        assert report.quoted_tokens > 0

    def test_fingerprint_only_source_still_matches(self) -> None:
        """External sources keep no text; the winnowing guarantee carries the match."""
        service, _ = self._service()
        stolen = make_text(80, seed=61, prefix="e")
        service.index_document(
            CorpusDocument(
                source_kind=SourceKind.EXTERNAL_OA,
                source_ref="doi:10.1000/x",
                source_url="https://example.org/x",
            ),
            f"{make_text(200, seed=62)} {stolen}",
            store_text=False,
        )

        report = service.detect(f"{make_text(150, seed=63)} {stolen}")
        assert len(report.documents) == 1
        assert report.documents[0].source_url == "https://example.org/x"
        assert report.documents[0].spans[0].matched_snippet == ""

    def test_matched_snippet_preserves_original_arabic_orthography(self) -> None:
        """UI evidence must show ة / على, not the folded matching forms."""
        service, _ = self._service()
        # Long enough for min_match_tokens; includes ta-marbuta and على.
        stolen = (
            "أصدر المشرع السوري قانونا جديدا لحماية المستهلك على وفق المادة "
            "وحاول المشرع من خلال هذا القانون ان يوفر الحماية الجزائية "
            "للمستهلك في مواجهة الممارسات الضارة بالاسواق المحلية "
        ) * 8
        assert "ة" in stolen and "على" in stolen
        service.index_document(
            CorpusDocument(source_kind=SourceKind.BACK_CATALOG, source_ref="ar.pdf"),
            f"{make_text(80, seed=81)} {stolen} {make_text(80, seed=82)}",
        )
        report = service.detect(f"{make_text(60, seed=83)} {stolen} {make_text(60, seed=84)}")
        assert report.documents
        snippet = report.documents[0].spans[0].matched_snippet
        assert "ة" in snippet or "على" in snippet
        assert "حمايه" not in snippet  # folded form must not be the evidence string

    def test_nul_in_body_does_not_break_index(self) -> None:
        service, store = self._service()
        body = f"{make_text(80, seed=91)} word\x00withnul {make_text(80, seed=92)}"
        service.index_document(
            CorpusDocument(source_kind=SourceKind.BACK_CATALOG, source_ref="nul.pdf"),
            body,
        )
        retained = next(iter(store._docs.values())).retained_text  # noqa: SLF001
        assert retained is not None
        assert "\x00" not in retained
        assert "word withnul" in retained

    def test_overlap_ratio_is_share_of_submission_tokens(self) -> None:
        service, _ = self._service()
        stolen = make_text(100, seed=71, prefix="h")
        service.index_document(
            CorpusDocument(source_kind=SourceKind.BACK_CATALOG, source_ref="a.pdf"),
            stolen,
        )
        report = service.detect(f"{stolen} {make_text(100, seed=72)}")
        assert 0.4 < report.overall_ratio < 0.6

    def test_empty_and_tiny_input(self) -> None:
        service, _ = self._service()
        assert service.detect("").documents == []
        assert service.detect("كلمتان فقط").documents == []


class TestContentDigest:
    def test_digest_changes_with_text(self) -> None:
        assert content_digest("abc") == content_digest("abc")
        assert content_digest("abc") != content_digest("abd")
