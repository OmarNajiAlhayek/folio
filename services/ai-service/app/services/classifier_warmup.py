from __future__ import annotations

import asyncio
import logging

from app.services.classifier_service import (
    ClassifierDisabledError,
    ClassifierService,
    ClassifierUnavailableError,
)

logger = logging.getLogger(__name__)


async def warmup_classifier_if_configured(classifier_service: ClassifierService) -> None:
    if not classifier_service.enabled:
        return
    try:
        await asyncio.to_thread(classifier_service.warmup)
    except ClassifierDisabledError:
        return
    except ClassifierUnavailableError as err:
        logger.warning("AraBERT warmup skipped: %s", err)
    except Exception:
        logger.exception("AraBERT warmup failed; first classify may be slow")
