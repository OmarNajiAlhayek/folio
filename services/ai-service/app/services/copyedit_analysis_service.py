from __future__ import annotations

import json
import logging
import re
from typing import Any

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


def _system_prompt() -> str:
    return (
        "You are an expert academic copyeditor specializing in citation and reference verification"
        " for the Damascus University Journal (مجلة جامعة دمشق للعلوم).\n\n"
        "You will receive:\n"
        "  1. REFERENCE LIST — bibliography entries at the end of the article.\n"
        "  2. INLINE CITATIONS — citation tokens extracted from the article body.\n\n"
        "## Task A — Cross-checking (mandatory)\n"
        "Check for:\n"
        "  - An inline citation that has no matching entry in the reference list (missing from bibliography).\n"
        "  - A reference list entry that is never cited in the body text (unused reference).\n"
        "  - Author name or year inconsistencies between body citations and the reference list.\n\n"
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
        "## Output rules\n"
        "1. Output ONLY a valid JSON array of short, specific issue strings — no prose, no markdown.\n"
        "2. Each string must clearly identify the citation or reference entry and the specific problem.\n"
        "3. If no issues are found, return an empty array: []\n"
        "4. Limit to at most 25 issues total across all tasks.\n"
        "5. Be lenient with minor formatting differences (e.g. '&' vs 'and', trailing punctuation,"
        " slight name abbreviations). Only flag clear, actionable violations.\n"
        "6. Write issue strings in English regardless of the article language."
    )


def _build_user_message(
    *,
    reference_list: list[str],
    inline_citations: list[str],
) -> str:
    refs_text = "\n".join(f"  {i + 1}. {ref}" for i, ref in enumerate(reference_list))
    cites_text = "\n".join(f"  - {c}" for c in inline_citations)
    return (
        f"## Reference List ({len(reference_list)} entries):\n{refs_text or '  (none)'}\n\n"
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
    ) -> list[str]:
        if not reference_list and not inline_citations:
            return []

        provider = self._require_ready()
        user_message = _build_user_message(
            reference_list=reference_list,
            inline_citations=inline_citations,
        )
        logger.info(
            "copyedit reference check (refs=%d, citations=%d)",
            len(reference_list),
            len(inline_citations),
        )
        raw = await provider.chat_json(_system_prompt(), user_message)
        issues = _parse_issues_from_json(raw)
        logger.info("copyedit reference check found %d issues", len(issues))
        return issues
