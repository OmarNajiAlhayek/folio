from __future__ import annotations

import logging
import sys

import grpc
from folio.ai.v1 import classifier_pb2, classifier_pb2_grpc

from app.config import Settings
from app.grpc.interceptors import ServiceTokenInterceptor
from app.grpc.servicer import ClassifierGrpcServicer
from app.services.classifier_service import ClassifierService

logger = logging.getLogger(__name__)


async def start_grpc_server(
    classifier_service: ClassifierService,
    settings: Settings,
) -> tuple[grpc.aio.Server, int]:
    interceptors: list[grpc.aio.ServerInterceptor] = []
    if settings.ai_service_token:
        interceptors.append(ServiceTokenInterceptor(settings.ai_service_token))

    server = grpc.aio.server(interceptors=interceptors)
    classifier_pb2_grpc.add_ClassifierServiceServicer_to_server(
        ClassifierGrpcServicer(classifier_service),
        server,
    )

    if settings.app_env == "development":
        try:
            from grpc_reflection.v1alpha import reflection

            service_names = (
                classifier_pb2.DESCRIPTOR.services_by_name["ClassifierService"].full_name,
                reflection.SERVICE_NAME,
            )
            reflection.enable_server_reflection(service_names, server)
        except ImportError:
            logger.debug("grpcio-reflection not installed; grpcurl needs -proto flags")

    listen_addr = f"0.0.0.0:{settings.grpc_port}"
    bound_port = server.add_insecure_port(listen_addr)
    if bound_port == 0:
        logger.error("gRPC failed to bind on %s", listen_addr)
        await server.stop(0)
        raise RuntimeError(f"gRPC failed to bind on {listen_addr}")

    await server.start()
    logger.info("gRPC listening on 0.0.0.0:%s", bound_port)
    return server, bound_port


async def stop_grpc_server(server: grpc.aio.Server | None, *, grace: float = 5) -> None:
    if server is None:
        return
    await server.stop(grace)
    logger.info("gRPC server stopped")


def fail_startup(message: str) -> None:
    print(message, file=sys.stderr)
    raise SystemExit(1)
