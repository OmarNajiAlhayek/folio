from __future__ import annotations

import grpc

from app.services.classifier_service import (
    ClassifierDisabledError,
    ClassifierUnavailableError,
)
from app.services.keyword_suggestion_service import (
    KeywordsDisabledError,
    KeywordsUnavailableError,
)
from app.services.reviewer_matching_grpc_service import (
    ReviewerMatchingDisabledError,
    ReviewerMatchingUnavailableError,
)
from app.services.similarity_service import (
    SimilarityDisabledError,
    SimilarityUnavailableError,
)


def grpc_code_and_details(exc: BaseException) -> tuple[grpc.StatusCode, str]:
    if isinstance(
        exc,
        (
            ClassifierDisabledError,
            KeywordsDisabledError,
            SimilarityDisabledError,
            ReviewerMatchingDisabledError,
        ),
    ):
        return grpc.StatusCode.FAILED_PRECONDITION, str(exc)
    if isinstance(
        exc,
        (
            ClassifierUnavailableError,
            KeywordsUnavailableError,
            SimilarityUnavailableError,
            ReviewerMatchingUnavailableError,
        ),
    ):
        return grpc.StatusCode.UNAVAILABLE, str(exc)
    if isinstance(exc, ValueError):
        return grpc.StatusCode.INVALID_ARGUMENT, str(exc)
    return grpc.StatusCode.INTERNAL, "AI service request failed"


async def abort_mapped(context: grpc.aio.ServicerContext, exc: BaseException) -> None:
    code, details = grpc_code_and_details(exc)
    await context.abort(code, details)
