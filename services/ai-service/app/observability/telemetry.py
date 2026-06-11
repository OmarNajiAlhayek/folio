from __future__ import annotations

import logging
import os
from typing import TypedDict

from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.grpc import GrpcAioInstrumentorServer
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

logger = logging.getLogger(__name__)

_provider: TracerProvider | None = None
_grpc_instrumentor: GrpcAioInstrumentorServer | None = None


class TraceExportConfig(TypedDict):
    enabled: bool
    endpoint: str | None


def resolve_trace_export_config(
    env: os._Environ[str] | None = None,
) -> TraceExportConfig:
    """OTEL_TRACES_EXPORTER is authoritative; endpoint required when exporter=otlp."""
    raw_env = env if env is not None else os.environ
    exporter = (raw_env.get("OTEL_TRACES_EXPORTER") or "none").strip().lower()

    if not exporter or exporter == "none":
        return {"enabled": False, "endpoint": None}

    if exporter != "otlp":
        logger.warning(
            'Unknown OTEL_TRACES_EXPORTER="%s"; trace export disabled',
            exporter,
        )
        return {"enabled": False, "endpoint": None}

    endpoint = (raw_env.get("OTEL_EXPORTER_OTLP_ENDPOINT") or "").strip()
    if not endpoint:
        logger.warning(
            "OTEL_TRACES_EXPORTER=otlp but OTEL_EXPORTER_OTLP_ENDPOINT is empty; "
            "trace export disabled",
        )
        return {"enabled": False, "endpoint": None}

    return {"enabled": True, "endpoint": endpoint}


def init_telemetry(service_name: str, deployment_environment: str) -> None:
    global _provider, _grpc_instrumentor
    if _provider is not None:
        return

    export_config = resolve_trace_export_config()
    resource = Resource.create(
        {
            "service.name": service_name,
            "deployment.environment": deployment_environment,
        }
    )
    provider = TracerProvider(resource=resource)

    if export_config["enabled"] and export_config["endpoint"]:
        exporter = OTLPSpanExporter(endpoint=export_config["endpoint"])
        provider.add_span_processor(BatchSpanProcessor(exporter))

    trace.set_tracer_provider(provider)
    _provider = provider

    _grpc_instrumentor = GrpcAioInstrumentorServer()
    _grpc_instrumentor.instrument()


def instrument_fastapi(app: object) -> None:
    FastAPIInstrumentor.instrument_app(app)


def shutdown_telemetry() -> None:
    global _provider, _grpc_instrumentor
    if _grpc_instrumentor is not None:
        _grpc_instrumentor.uninstrument()
        _grpc_instrumentor = None
    if _provider is not None:
        _provider.shutdown()
        _provider = None
