from __future__ import annotations

from collections.abc import Callable

import grpc
from grpc.aio import ServerInterceptor


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
        if token != self._expected_token:
            async def _unauthenticated(_request: object, context: grpc.aio.ServicerContext) -> None:
                await context.abort(
                    grpc.StatusCode.UNAUTHENTICATED,
                    "Invalid or missing x-folio-service-token",
                )

            return grpc.unary_unary_rpc_method_handler(_unauthenticated)

        return await continuation(handler_call_details)
