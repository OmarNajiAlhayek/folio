from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from app.config import Settings
from app.services.copyedit_analysis_service import (
    CopyeditAnalysisService,
    _build_user_message,
    _system_prompt,
    normalize_citation_style,
)


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("vancouver", "vancouver"),
        (" Vancouver ", "vancouver"),
        ("apa", "apa"),
        ("", "apa"),
        (None, "apa"),
        ("chicago", "apa"),
    ],
)
def test_normalize_citation_style(value: str | None, expected: str) -> None:
    assert normalize_citation_style(value) == expected


def test_vancouver_prompt_checks_numbering_not_alphabetical_order() -> None:
    prompt = _system_prompt("vancouver")
    assert "VANCOUVER" in prompt
    assert "order of first citation" in prompt
    assert "do NOT flag entries for not being alphabetical" in prompt
    assert "Arabic references must all appear before English references" not in prompt


def test_apa_prompt_keeps_damascus_author_year_rules() -> None:
    prompt = _system_prompt("apa")
    assert "APA" in prompt
    assert "Arabic references must all appear before English references" in prompt
    assert "'وآخرون'" in prompt
    assert "order of first citation" not in prompt


def test_user_message_names_the_required_style() -> None:
    message = _build_user_message(
        reference_list=["Smith JA. Title. J Med. 2020;1(2):3-4."],
        inline_citations=["[1]"],
        citation_style="vancouver",
    )
    assert "Citation style required by the journal: VANCOUVER" in message
    assert "numbered in the author's order" in message


@pytest.mark.asyncio
async def test_check_references_sends_the_style_specific_prompt() -> None:
    service = CopyeditAnalysisService(Settings(copyedit_analysis_enabled=False))
    provider = MagicMock()
    provider.chat_json = AsyncMock(return_value='["Citation [3] has no entry"]')
    service._require_ready = lambda: provider  # type: ignore[method-assign]

    issues = await service.check_references(
        reference_list=["Ref one", "Ref two"],
        inline_citations=["[1]", "[3]"],
        citation_style="vancouver",
    )

    assert issues == ["Citation [3] has no entry"]
    system_prompt, user_message = provider.chat_json.await_args.args
    assert "VANCOUVER" in system_prompt
    assert "VANCOUVER" in user_message
