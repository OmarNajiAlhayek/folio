from __future__ import annotations

import json
import logging
import re
from typing import Any

from app.config import PLACEHOLDER_OPENAI_KEYS, AiProviderKind, Settings
from app.providers.openai_compat import OpenAiCompatProvider

logger = logging.getLogger(__name__)

KEYWORD_MAX_COUNT = 6
KEYWORD_MAX_TOKEN_LENGTH = 80

_JSON_OBJECT_RE = re.compile(r"\{.*\}", re.DOTALL)


class KeywordsDisabledError(RuntimeError):
    """Raised when keyword suggestion is disabled via configuration."""


class KeywordsUnavailableError(RuntimeError):
    """Raised when keyword suggestion requires OpenAI but it is not configured."""


def _parse_bool(value: object) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _normalize_list(items: list[Any], *, locale: str) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for raw in items:
        if not isinstance(raw, str):
            continue
        trimmed = raw.strip()
        if not trimmed or len(trimmed) > KEYWORD_MAX_TOKEN_LENGTH:
            continue
        key = trimmed.lower() if locale == "en" else trimmed
        if key in seen:
            continue
        seen.add(key)
        out.append(trimmed)
        if len(out) >= KEYWORD_MAX_COUNT:
            break
    return out


def _parse_llm_json(raw: str) -> dict[str, Any]:
    text = raw.strip()
    if not text:
        raise ValueError("empty model output")
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        match = _JSON_OBJECT_RE.search(text)
        if not match:
            raise ValueError("model output contains no valid JSON") from None
        parsed = json.loads(match.group(0))
    if not isinstance(parsed, dict):
        raise ValueError("model output must be a JSON object")
    return parsed


def _default_system_prompt() -> str:
    return (
        "You are a precise bilingual (Arabic/English) scientific keyword extractor.\n"
        "أنت أداة استخراج كلمات مفتاحية علمية ثنائية اللغة (عربي/إنجليزي) عالية الدقة.\n\n"
        "Given article metadata, return a single JSON object with EXACTLY these keys:\n"
        '  - "keywords_en": array of English indexing-style keyword strings\n'
        '  - "keywords_ar": array of Arabic indexing-style keyword strings\n\n'
        "Rules:\n"
        "1. Output ONLY valid JSON — no prose, no markdown fences.\n"
        "2. Use short indexing terms (not full sentences); preserve each language.\n"
        "3. Target 3–6 items per non-empty language bucket; use [] if insufficient text.\n"
        "4. If only English fields are provided, keywords_ar MUST be []. "
        "If only Arabic fields are provided, keywords_en MUST be [].\n"
        "5. No duplicates within each array."
    )


class KeywordSuggestionService:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._openai: OpenAiCompatProvider | None = None
        if settings.ai_provider == AiProviderKind.OPENAI:
            self._openai = OpenAiCompatProvider(settings)

    @property
    def enabled(self) -> bool:
        if not _parse_bool(self._settings.keywords_suggestion_enabled):
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
            raise KeywordsDisabledError(
                "Keyword suggestion is disabled "
                "(KEYWORDS_SUGGESTION_ENABLED=false or AI_PROVIDER is not openai)",
            )
        if self._openai is None:
            raise KeywordsUnavailableError("OpenAI provider is not configured")
        return self._openai

    @staticmethod
    def _has_language_pair(
        title: str | None,
        abstract: str | None,
    ) -> bool:
        return bool(title and title.strip() and abstract and abstract.strip())

    @staticmethod
    def _build_user_message(
        *,
        title: str | None,
        abstract: str | None,
        title_ar: str | None,
        abstract_ar: str | None,
    ) -> str:
        parts: list[str] = []
        if title and title.strip() and abstract and abstract.strip():
            parts.append(f"## Title (English):\n{title.strip()}")
            parts.append(f"## Abstract (English):\n{abstract.strip()}")
        if title_ar and title_ar.strip() and abstract_ar and abstract_ar.strip():
            parts.append(f"## Title (Arabic):\n{title_ar.strip()}")
            parts.append(f"## Abstract (Arabic):\n{abstract_ar.strip()}")
        parts.append("## Output (JSON only):")
        return "\n\n".join(parts)

    async def suggest(
        self,
        *,
        title: str | None = None,
        abstract: str | None = None,
        title_ar: str | None = None,
        abstract_ar: str | None = None,
    ) -> dict[str, list[str]]:
        has_en = self._has_language_pair(title, abstract)
        has_ar = self._has_language_pair(title_ar, abstract_ar)
        if not has_en and not has_ar:
            raise ValueError(
                "Provide English or Arabic title and abstract before suggesting keywords",
            )

        provider = self._require_ready()
        user_message = self._build_user_message(
            title=title,
            abstract=abstract,
            title_ar=title_ar,
            abstract_ar=abstract_ar,
        )
        logger.info(
            "keyword suggest request (en=%s ar=%s)",
            has_en,
            has_ar,
        )
        raw = await provider.chat_json(_default_system_prompt(), user_message)
        parsed = _parse_llm_json(raw)
        en_raw = parsed.get("keywords_en", [])
        ar_raw = parsed.get("keywords_ar", [])
        if not isinstance(en_raw, list):
            en_raw = []
        if not isinstance(ar_raw, list):
            ar_raw = []
        keywords_en = _normalize_list(en_raw, locale="en") if has_en else []
        keywords_ar = _normalize_list(ar_raw, locale="ar") if has_ar else []
        if not keywords_en and not keywords_ar:
            raise ValueError("No keywords could be extracted from the provided text")
        logger.info(
            "keyword suggest result (en_count=%s ar_count=%s)",
            len(keywords_en),
            len(keywords_ar),
        )
        return {"keywords_en": keywords_en, "keywords_ar": keywords_ar}
