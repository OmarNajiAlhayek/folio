"""Google Custom Search Engine client."""

from __future__ import annotations

import logging

from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

logger = logging.getLogger(__name__)


def get_search_results(
    query: str,
    *,
    api_key: str,
    cse_id: str,
    num_results: int = 10,
    search_lang: str = "ar",
) -> list[str]:
    service = build("customsearch", "v1", developerKey=api_key)
    try:
        res = (
            service.cse()
            .list(
                q=query,
                cx=cse_id,
                num=min(num_results, 10),
                lr=f"lang_{search_lang}",
            )
            .execute()
        )
        return [item["link"] for item in res.get("items", [])]
    except HttpError as exc:
        if exc.resp.status in (403, 429):
            logger.warning("Google CSE quota or permission error: %s", exc)
        else:
            logger.error("Google CSE error: %s", exc)
        return []
    except Exception as exc:
        logger.error("Google CSE error: %s", exc)
        return []
