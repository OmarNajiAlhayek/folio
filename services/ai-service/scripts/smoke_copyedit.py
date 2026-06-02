"""One-off smoke test: reference cross-check via LM Studio / OpenAI-compatible API."""
from __future__ import annotations

import asyncio

from app.config import get_settings
from app.services.copyedit_analysis_service import CopyeditAnalysisService


async def main() -> None:
    settings = get_settings()
    svc = CopyeditAnalysisService(settings)
    print("copyedit enabled:", svc.enabled)
    issues = await svc.check_references(
        reference_list=["Smith J. Example study. 2020."],
        inline_citations=["(Smith, 2020)", "(Jones, 2019)"],
    )
    print("issues:", issues)


if __name__ == "__main__":
    asyncio.run(main())
