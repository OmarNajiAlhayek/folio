from __future__ import annotations

import json
import logging
import re
from typing import Any, Literal

from app.config import PLACEHOLDER_OPENAI_KEYS, AiProviderKind, Settings
from app.providers.openai_compat import OpenAiCompatProvider

logger = logging.getLogger(__name__)

_JSON_ARRAY_RE = re.compile(r"\[.*?\]", re.DOTALL)


class CopyeditAnalysisDisabledError(RuntimeError):
    """Raised when copyedit analysis is disabled via configuration."""


class CopyeditAnalysisUnavailableError(RuntimeError):
    """Raised when copyedit analysis requires OpenAI but it is not configured."""


def _parse_bool(value: object) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _parse_issues_from_json(raw: str) -> list[str]:
    """Extract a JSON array of strings from the LLM response."""
    text = raw.strip()
    if not text:
        return []
    try:
        parsed = json.loads(text)
        if isinstance(parsed, list):
            return [str(i).strip() for i in parsed if str(i).strip()]
    except json.JSONDecodeError:
        match = _JSON_ARRAY_RE.search(text)
        if match:
            try:
                parsed = json.loads(match.group(0))
                if isinstance(parsed, list):
                    return [str(i).strip() for i in parsed if str(i).strip()]
            except json.JSONDecodeError:
                pass
    return []


CitationStyle = Literal["apa", "vancouver"]


def normalize_citation_style(value: str | None) -> CitationStyle:
    """Journal citation style from the request; empty (older clients) or unknown → APA."""
    style = (value or "").strip().lower()
    if style == "vancouver":
        return "vancouver"
    if style not in ("", "apa"):
        logger.warning("unknown citation_style %r; using apa", value)
    return "apa"


_PROMPT_INTRO = (
    "You are an expert academic copyeditor specializing in citation and reference verification"
    " for the Damascus University Journal (مجلة جامعة دمشق للعلوم).\n\n"
    "You will receive:\n"
    "  1. REFERENCE LIST — bibliography entries at the end of the article.\n"
    "  2. INLINE CITATIONS — citation tokens extracted from the article body.\n\n"
)

_PROMPT_OUTPUT_RULES = (
    "## Output rules\n"
    "1. Output ONLY a valid JSON array of short, specific issue strings — no prose, no markdown.\n"
    "2. Each string must clearly identify the citation or reference entry and the specific problem.\n"
    "3. If no issues are found, return an empty array: []\n"
    "4. Limit to at most 25 issues total across all tasks.\n"
    "5. Be lenient with minor formatting differences (e.g. '&' vs 'and', trailing punctuation,"
    " slight name abbreviations). Only flag clear, actionable violations.\n"
    "6. Write issue strings in English regardless of the article language."
)

# The journal decides the style: APA for every journal, Vancouver for the
# medical journal (مجلة العلوم الطبية). Checking a Vancouver article against
# APA rules would flag every correct numbered citation, so the prompts differ.
_VANCOUVER_RULES = (
    "This journal requires the VANCOUVER citation style (numbered citations).\n\n"
    "## Task A — Cross-checking (mandatory)\n"
    "Reference list entries are numbered 1, 2, 3 … in the order shown. Inline citations are"
    " listed in order of first appearance in the body. Check for:\n"
    "  - A cited number with no reference list entry of that number (e.g. [12] when the list has 10 entries).\n"
    "  - A reference list entry whose number is never cited in the body text (unused reference).\n"
    "  - Numbers not assigned in order of first citation: the first reference cited must be [1],"
    " the next new reference [2], and so on. Flag the first out-of-order number.\n\n"
    "## Task B — Vancouver in-text citation rules\n"
    "Check every inline citation for:\n"
    "  - Citations must be numbers in square brackets: [1], multiple as [1,3] and consecutive"
    " runs as a range [4–6]. Flag author–year citations such as '(Smith, 2020)' or"
    " '(المقدسي، 2020)' — they are APA style and not accepted by this journal.\n"
    "  - The same source must keep the same number every time it is cited.\n"
    "  - Quranic verse citations must include the surah name and verse number, e.g. (البقرة: 255).\n\n"
    "## Task C — Vancouver reference list rules\n"
    "Check the reference list entries for:\n"
    "  - Order is the order of first citation — do NOT flag entries for not being alphabetical,"
    " and do NOT flag English entries appearing before Arabic ones.\n"
    "  - Authors as surname followed by initials without periods (e.g. 'Smith JA'), separated"
    " by commas; list up to six authors, then 'et al.' (Arabic: 'وآخرون').\n"
    "  - Journal articles: Authors. Title. Journal name (abbreviated). Year;Volume(Issue):pages."
    " Flag entries in APA layout with the year in parentheses after the authors, e.g. 'Smith, J. (2020).'.\n"
    "  - Books: Authors. Title. Edition. Place: Publisher; Year.\n"
    "  - Internet references: include the URL and the date cited/accessed.\n"
    "  - Flag entries missing a major field (author, title or year). Include the DOI when available.\n\n"
)

_APA_RULES = (
    "This journal requires the APA citation style (author–year citations).\n\n"
    "## Task A — Cross-checking (mandatory)\n"
    "Check for:\n"
    "  - An inline citation that has no matching entry in the reference list (missing from bibliography).\n"
    "  - A reference list entry that is never cited in the body text (unused reference).\n"
    "  - Author name or year inconsistencies between body citations and the reference list.\n"
    "  - Numbered citations such as '[1]' — they are Vancouver style and not accepted by this journal.\n\n"
    "## Task B — Damascus University citation style rules (§6 of the journal guidelines)\n"
    "Check every inline citation for:\n"
    "  - Use of 'ص' or 'p.' before a page number — Damascus University §6 forbids these prefixes."
    " Flag any citation like '(المقدسي، 2020، ص 118)' or '(Smith, 2020, p. 45)'.\n"
    "  - Multiple-author citations: Arabic citations must use 'وآخرون' (not 'وزملاؤه' or other variants);"
    " English citations must use 'et al.' in italics. Flag deviations.\n"
    "  - Same-author same-year citations: when two or more references share the same author and year,"
    " the citation must add 'أ'/'ب' (Arabic) or 'a'/'b' (English) suffixes, e.g. (المقدسي، 2020أ)."
    " Flag if this disambiguation is missing.\n"
    "  - Quranic verse citations must include the surah name and verse number, e.g. (البقرة: 255)."
    " A citation that only gives a page or a year for a Quranic verse is non-compliant.\n"
    "  - Multiple references in one citation should be separated by a semicolon (;) and ordered"
    " alphabetically. Flag if they are not separated properly.\n\n"
    "## Task C — Damascus University reference list rules (§7 of the journal guidelines)\n"
    "Check the reference list entries for:\n"
    "  - Mixing order: Arabic references must all appear before English references. Flag any"
    " English entry that precedes an Arabic entry.\n"
    "  - Each reference should contain: author name(s), year in parentheses, title (in italics"
    " for books/journals — indicated by <em> or _underscores_ in text), publisher or journal"
    " name, volume/issue/page range where applicable, and DOI if available. Flag entries that"
    " appear to be missing major required fields (author, year, or title).\n"
    "  - Book references: must include edition (طبعة / ed.) and total pages or page range.\n"
    "  - Journal article references: must include journal name, volume(issue), and page range.\n"
    "  - Thesis/dissertation references: must include degree type, department, faculty, university.\n"
    "  - Internet/website references: must include retrieval date and full URL.\n\n"
)


def _system_prompt(citation_style: CitationStyle = "apa") -> str:
    rules = _VANCOUVER_RULES if citation_style == "vancouver" else _APA_RULES
    return _PROMPT_INTRO + rules + _PROMPT_OUTPUT_RULES


def _build_user_message(
    *,
    reference_list: list[str],
    inline_citations: list[str],
    citation_style: CitationStyle = "apa",
) -> str:
    refs_text = "\n".join(f"  {i + 1}. {ref}" for i, ref in enumerate(reference_list))
    cites_text = "\n".join(f"  - {c}" for c in inline_citations)
    refs_note = " — numbered in the author's order" if citation_style == "vancouver" else ""
    return (
        f"## Citation style required by the journal: {citation_style.upper()}\n\n"
        f"## Reference List ({len(reference_list)} entries{refs_note}):\n{refs_text or '  (none)'}\n\n"
        f"## Inline Citations from body ({len(inline_citations)} found):\n{cites_text or '  (none)'}\n\n"
        "## Output (JSON array of issue strings only):"
    )


class CopyeditAnalysisService:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._openai: OpenAiCompatProvider | None = None
        if settings.ai_provider == AiProviderKind.OPENAI:
            self._openai = OpenAiCompatProvider(settings)

    @property
    def enabled(self) -> bool:
        if not _parse_bool(self._settings.copyedit_analysis_enabled):
            return False
        if self._settings.ai_provider != AiProviderKind.OPENAI:
            return False
        key = self._settings.openai_api_key.strip()
        if key.lower() in PLACEHOLDER_OPENAI_KEYS:
            return False
        return True

    def status(self) -> dict[str, bool]:
        return {"enabled": self.enabled}

    def _require_ready(self) -> OpenAiCompatProvider:
        if not self.enabled:
            raise CopyeditAnalysisDisabledError(
                "Copyedit analysis is disabled "
                "(COPYEDIT_ANALYSIS_ENABLED=false or AI_PROVIDER is not openai)",
            )
        if self._openai is None:
            raise CopyeditAnalysisUnavailableError("OpenAI provider is not configured")
        return self._openai

    async def check_references(
        self,
        *,
        reference_list: list[str],
        inline_citations: list[str],
        citation_style: str | None = None,
    ) -> list[str]:
        if not reference_list and not inline_citations:
            return []

        provider = self._require_ready()
        style = normalize_citation_style(citation_style)
        user_message = _build_user_message(
            reference_list=reference_list,
            inline_citations=inline_citations,
            citation_style=style,
        )
        logger.info(
            "copyedit reference check (style=%s, refs=%d, citations=%d)",
            style,
            len(reference_list),
            len(inline_citations),
        )
        raw = await provider.chat_json(_system_prompt(style), user_message)
        issues = _parse_issues_from_json(raw)
        logger.info("copyedit reference check found %d issues", len(issues))
        return issues
