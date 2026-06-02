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
        "You are an expert academic copyeditor specializing in citation and reference verification.\n\n"
        "Given:\n"
        "  1. A list of REFERENCE LIST entries (the bibliography at the end of the article)\n"
        "  2. A list of INLINE CITATIONS found in the body text (e.g. '(Smith, 2020)')\n\n"
        "Your task: identify cross-checking issues.\n"
        "Look for:\n"
        "  - An inline citation that does not match any reference list entry (missing from bibliography)\n"
        "  - A reference list entry that is never cited in the body text (unused reference)\n"
        "  - Author name or year inconsistencies between body citations and the reference list\n\n"
        "Rules:\n"
        "1. Output ONLY a valid JSON array of short, specific issue strings — no prose, no markdown.\n"
        "2. Each string should clearly identify the citation or reference and the problem.\n"
        "3. If no issues are found, return an empty array: []\n"
        "4. Limit to at most 20 issues.\n"
        "5. Be lenient with minor formatting differences (e.g. '&' vs 'and', trailing punctuation)."
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
