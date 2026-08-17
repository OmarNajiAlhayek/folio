"""Detect text that extracted into garbage before it poisons the corpus.

Arabic PDFs produced by some Word-to-PDF pipelines carry no usable ``ToUnicode``
CMap, so extractors receive glyph indices and emit *valid Arabic code points that
spell nothing*. The Damascus back catalogue is full of these: the same file that
reads perfectly on screen extracts as ``إت ل ف لدايرس ل ةا لب ةع``.

A second failure mode is subtler: systematic letter substitution
(``على`` → ``عمى``, ``التسويق`` → ``التدهيق``). Enough real function words
(``في``, ``مع``, ``لا``) survive that a function-word-only gate scores the text
as merely ``suspect`` and lets it into the corpus — then the editor sees
unreadable evidence snippets.

Character-level checks do not catch either mode (those *are* Arabic code points).
What catches them is vocabulary plus a substitution-rescue ratio.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from enum import StrEnum

from app.ml.exact_match.arabic_normalize import normalize_token, tokenize

# The most frequent Arabic function words. Deliberately small and closed: these
# appear in essentially every Arabic text regardless of discipline.
_ARABIC_FUNCTION_WORDS = frozenset(
    normalize_token(word)
    for word in (
        "في من على هذا هذه التي الذي أن إن مع عن كما قد لا ما بين كل عند بعد "
        "ذلك حيث عن إلى أو ثم لكن حتى هو هي كان كانت يكون له لها به بها"
    ).split()
)

# High-frequency general / academic Arabic. Kept small on purpose so medical,
# math, and English-heavy papers are not punished for rare vocabulary. Used
# only together with the function-word score (see assess_text).
_ARABIC_LEXICON = frozenset(
    normalize_token(word)
    for word in (
        "في من على هذا هذه التي الذي أن إن مع عن كما قد لا ما بين كل عند بعد "
        "ذلك حيث إلى أو ثم لكن حتى هو هي كان كانت يكون له لها به بها "
        "دراسة بحث نتائج تحليل منهج منهجية عينة بيانات نظرية تطبيق تطبيقات "
        "جامعة دمشق مجلة مقالة خلاصة ملخص مقدمة خاتمة مراجع "
        "تأثير علاقة عوامل مستوى دور أهمية مشكلة أهداف فرضيات توصيات "
        "البحث الدراسة النتائج العوامل التأثير العلاقة المستوى المنهج "
        "العينة البيانات ايضا أيضا غير خلال قبل نحو عبر ضد ضدها "
        "يمكن يكون تكون يوجد توجد يتم يتمحور حول حسب لدى لدى "
    ).split()
)

_ENGLISH_FUNCTION_WORDS = frozenset(
    {
        "the", "of", "and", "to", "in", "is", "that", "for", "with", "as", "was",
        "are", "this", "be", "by", "on", "an", "it", "from", "or", "which", "has",
    },
)

# A glyph repeated many times in a row ("ةةةةة") is the signature of a broken CMap.
_REPEAT_RUN = re.compile(r"(.)\1{3,}")

_ARABIC_CHAR = re.compile(r"[\u0600-\u06FF]")

# Observed Damascus CMap substitution families (garbled form → clean attempt).
# Applied only as a *ratio* over Arabic tokens that are out-of-lexicon but become
# in-lexicon after a map — never as a per-token reject (عمى is a real word).
_SUBSTITUTION_MAPS: tuple[dict[str, str], ...] = (
    str.maketrans({"م": "ل"}),
    str.maketrans({"م": "ل", "غ": "ن"}),
    str.maketrans({"م": "ل", "د": "س", "غ": "ن"}),
    str.maketrans({"م": "ل", "ر": "ص", "خ": "ر", "غ": "ن", "ي": "ه", "د": "س"}),
)

# Thresholds calibrated on the Damascus back catalogue: clean DOCX scored
# 0.112-0.132, broken PDFs 0.006-0.007, with one ambiguous file at 0.048.
GOOD_FUNCTION_WORD_RATIO = 0.07
BROKEN_FUNCTION_WORD_RATIO = 0.03
BROKEN_SHORT_TOKEN_RATIO = 0.25
# Lexicon floor used only *with* a low function-word score (never alone).
BROKEN_LEXICON_RATIO = 0.05
# Substitution-rescue ratio that, with a sub-good function-word score *and* a
# still-weak lexicon, marks CMap letter-substitution garbage (التدهيق / عمى).
# Requiring a weak lexicon stops the م→ل map from condemning readable text that
# happens to "rescue" a few OOV tokens by chance.
BROKEN_SUBSTITUTION_RESCUE_RATIO = 0.02
SUBSTITUTION_LEXICON_CEILING = 0.12
MIN_TOKENS_TO_JUDGE = 300


class TextQuality(StrEnum):
    GOOD = "good"
    SUSPECT = "suspect"
    BROKEN = "broken"
    TOO_SHORT = "too_short"


@dataclass(frozen=True)
class QualityReport:
    quality: TextQuality
    token_count: int
    function_word_ratio: float
    short_token_ratio: float
    repeat_run_count: int
    lexicon_ratio: float = 1.0
    substitution_rescue_ratio: float = 0.0
    reason: str = ""

    @property
    def usable(self) -> bool:
        """Whether this text is human-readable enough to show (GOOD or SUSPECT)."""
        return self.quality in {TextQuality.GOOD, TextQuality.SUSPECT}

    @property
    def indexable(self) -> bool:
        """Whether this text may enter the fingerprint corpus. GOOD only."""
        return self.quality is TextQuality.GOOD

    @property
    def score(self) -> float:
        """
        Composite ranking score for best-of extractor / OCR acceptance.

        Higher is better. Substitution-rescue pushes the score down so a
        letter-substituted extraction cannot outrank a clean one that has a
        slightly lower raw function-word ratio.
        """
        if self.quality is TextQuality.TOO_SHORT:
            return -1.0
        quality_bonus = {
            TextQuality.GOOD: 1.0,
            TextQuality.SUSPECT: 0.0,
            TextQuality.BROKEN: -1.0,
        }[self.quality]
        return (
            quality_bonus
            + self.function_word_ratio
            + 0.5 * self.lexicon_ratio
            - self.substitution_rescue_ratio
        )


def _is_arabic_token(token: str) -> bool:
    return bool(_ARABIC_CHAR.search(token))


def _lexicon_and_rescue(tokens: list[str]) -> tuple[float, float]:
    """Return ``(lexicon_ratio, substitution_rescue_ratio)`` over Arabic tokens."""
    arabic = [t for t in tokens if _is_arabic_token(t)]
    if not arabic:
        # English-only / non-Arabic: do not punish missing Arabic lexicon hits.
        return 1.0, 0.0

    lexicon_hits = sum(1 for t in arabic if t in _ARABIC_LEXICON)
    rescued = 0
    for token in arabic:
        if token in _ARABIC_LEXICON:
            continue
        if any(token.translate(mapping) in _ARABIC_LEXICON for mapping in _SUBSTITUTION_MAPS):
            rescued += 1
    n = len(arabic)
    return lexicon_hits / n, rescued / n


def assess_text(text: str, *, min_tokens: int = MIN_TOKENS_TO_JUDGE) -> QualityReport:
    """
    Judge whether extracted text is real language or extraction garbage.

    Scores against Arabic *and* English function words and takes the better of the
    two, so a bilingual or English-only article is not condemned for lacking
    Arabic particles. Lexicon and substitution-rescue apply only to Arabic-script
    tokens; English-only documents keep ``lexicon_ratio=1``.
    """
    tokens = [token.text for token in tokenize(text)]
    total = len(tokens)
    if total < min_tokens:
        return QualityReport(
            quality=TextQuality.TOO_SHORT,
            token_count=total,
            function_word_ratio=0.0,
            short_token_ratio=0.0,
            repeat_run_count=0,
            reason=f"only {total} tokens; too little to judge",
        )

    arabic_hits = sum(1 for t in tokens if t in _ARABIC_FUNCTION_WORDS)
    english_hits = sum(1 for t in tokens if t in _ENGLISH_FUNCTION_WORDS)
    function_ratio = max(arabic_hits, english_hits) / total
    short_ratio = sum(1 for t in tokens if len(t) <= 2) / total
    repeats = len(_REPEAT_RUN.findall(text))
    lexicon_ratio, rescue_ratio = _lexicon_and_rescue(tokens)

    # 1) Classic broken font encoding — almost no function words.
    definitely_broken = function_ratio < BROKEN_FUNCTION_WORD_RATIO
    # 2) Review rule: BROKEN only when lexicon AND function-word are both low.
    #    Low lexicon alone → SUSPECT (medical / math / jargon-heavy Arabic).
    both_low = (
        function_ratio < GOOD_FUNCTION_WORD_RATIO
        and lexicon_ratio < BROKEN_LEXICON_RATIO
    )
    # 3) CMap letter-substitution: function words partially survive, but many
    #    OOV tokens become lexicon hits after the observed letter map. Require a
    #    still-weak lexicon so chance rescues on readable text do not condemn it.
    substitution_broken = (
        function_ratio < GOOD_FUNCTION_WORD_RATIO
        and rescue_ratio >= BROKEN_SUBSTITUTION_RESCUE_RATIO
        and lexicon_ratio < SUBSTITUTION_LEXICON_CEILING
    )
    # Short-token corroboration only for *clearly* low function-word scores.
    # Arabic has many ≤2-char particles after normalization, so pairing short
    # tokens with the whole SUSPECT band (fw < 7%) false-positives readable text.
    corroborated = (
        function_ratio < BROKEN_FUNCTION_WORD_RATIO * 1.5
        and short_ratio > BROKEN_SHORT_TOKEN_RATIO
        and lexicon_ratio < BROKEN_LEXICON_RATIO
    )

    if definitely_broken or both_low or substitution_broken or corroborated:
        return QualityReport(
            quality=TextQuality.BROKEN,
            token_count=total,
            function_word_ratio=function_ratio,
            short_token_ratio=short_ratio,
            repeat_run_count=repeats,
            lexicon_ratio=lexicon_ratio,
            substitution_rescue_ratio=rescue_ratio,
            reason=(
                f"function words {function_ratio:.1%}, lexicon {lexicon_ratio:.1%}, "
                f"substitution-rescue {rescue_ratio:.1%} — unreadable extraction"
            ),
        )

    if (
        function_ratio < GOOD_FUNCTION_WORD_RATIO
        or repeats > total / 50
        or lexicon_ratio < BROKEN_LEXICON_RATIO
    ):
        return QualityReport(
            quality=TextQuality.SUSPECT,
            token_count=total,
            function_word_ratio=function_ratio,
            short_token_ratio=short_ratio,
            repeat_run_count=repeats,
            lexicon_ratio=lexicon_ratio,
            substitution_rescue_ratio=rescue_ratio,
            reason=(
                f"function words {function_ratio:.1%}, lexicon {lexicon_ratio:.1%}; "
                "partially garbled — spot-check this file"
            ),
        )

    return QualityReport(
        quality=TextQuality.GOOD,
        token_count=total,
        function_word_ratio=function_ratio,
        short_token_ratio=short_ratio,
        repeat_run_count=repeats,
        lexicon_ratio=lexicon_ratio,
        substitution_rescue_ratio=rescue_ratio,
    )
