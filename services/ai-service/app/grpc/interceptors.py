from __future__ import annotations

import hmac
import time
from collections.abc import Callable

import grpc
import structlog
from grpc.aio import ServerInterceptor

from app.observability.log_fields import LOG_FIELDS

REQUEST_ID_METADATA_KEY = "x-request-id"


class ServiceTokenInterceptor(ServerInterceptor):
    """Require x-folio-service-token metadata when AI_SERVICE_TOKEN is configured."""

    def __init__(self, expected_token: str) -> None:
        self._expected_token = expected_token.strip()

    async def intercept_service(
        self,
        continuation: Callable,
        handler_call_details: grpc.HandlerCallDetails,
    ) -> grpc.RpcMethodHandler:
        if not self._expected_token:
            return await continuation(handler_call_details)

        metadata = dict(handler_call_details.invocation_metadata or [])
        token = metadata.get("x-folio-service-token", "")
        if not hmac.compare_digest(token, self._expected_token):

            async def _unauthenticated(_request: object, context: grpc.aio.ServicerContext) -> None:
                await context.abort(
                    grpc.StatusCode.UNAUTHENTICATED,
                    "Invalid or missing x-folio-service-token",
                )

            return grpc.unary_unary_rpc_method_handler(_unauthenticated)

        return await continuation(handler_call_details)


class LoggingInterceptor(ServerInterceptor):
    """Bind request metadata to structlog and log RPC lifecycle."""

    async def intercept_service(
        self,
        continuation: Callable,
        handler_call_details: grpc.HandlerCallDetails,
    ) -> grpc.RpcMethodHandler:
        metadata = dict(handler_call_details.invocation_metadata or [])
        request_id = metadata.get(REQUEST_ID_METADATA_KEY)
        method = handler_call_details.method or "unknown"
        started = time.perf_counter()

        log = structlog.get_logger("grpc").bind(
            context="grpc",
            grpc_method=method,
        )
        if request_id:
            log = log.bind(**{LOG_FIELDS["request_id"]: request_id})

        log.info("grpc request started")
        try:
            handler = await continuation(handler_call_details)
        except Exception:
            duration_ms = (time.perf_counter() - started) * 1000
            log.exception(
                "grpc request failed",
                duration_ms=round(duration_ms, 2),
            )
            raise
        duration_ms = (time.perf_counter() - started) * 1000
        log.info("grpc request completed", duration_ms=round(duration_ms, 2))
        return handler
