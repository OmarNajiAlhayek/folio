from __future__ import annotations

import grpc

from app.services.classifier_service import (
    ClassifierDisabledError,
    ClassifierUnavailableError,
)


def grpc_code_and_details(exc: BaseException) -> tuple[grpc.StatusCode, str]:
    if isinstance(exc, ClassifierDisabledError):
        return grpc.StatusCode.FAILED_PRECONDITION, str(exc)
    if isinstance(exc, ClassifierUnavailableError):
        return grpc.StatusCode.UNAVAILABLE, str(exc)
    if isinstance(exc, ValueError):
        return grpc.StatusCode.INVALID_ARGUMENT, str(exc)
    return grpc.StatusCode.INTERNAL, "Classification failed"


async def abort_mapped(context: grpc.aio.ServicerContext, exc: BaseException) -> None:
    code, details = grpc_code_and_details(exc)
    await context.abort(code, details)
