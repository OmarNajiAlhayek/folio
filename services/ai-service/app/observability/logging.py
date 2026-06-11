from __future__ import annotations

import json
import logging
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import structlog
from opentelemetry import trace

from app.observability.log_fields import LOG_FIELDS, REQUIRED_LOG_KEYS

_SCHEMA_FIXTURE = (
    Path(__file__).resolve().parents[4]
    / "packages"
    / "shared"
    / "observability"
    / "log-schema.fixture.json"
)


def _add_otel_fields(
    _logger: logging.Logger,
    _method_name: str,
    event_dict: dict[str, Any],
) -> dict[str, Any]:
    span = trace.get_current_span()
    ctx = span.get_span_context()
    if ctx.is_valid:
        event_dict[LOG_FIELDS["trace_id"]] = format(ctx.trace_id, "032x")
        event_dict[LOG_FIELDS["span_id"]] = format(ctx.span_id, "016x")
    return event_dict


def _rename_event_to_msg(
    _logger: logging.Logger,
    _method_name: str,
    event_dict: dict[str, Any],
) -> dict[str, Any]:
    if "event" in event_dict:
        event_dict[LOG_FIELDS["msg"]] = event_dict.pop("event")
    return event_dict


def configure_logging(
    *,
    service_name: str,
    log_level: str,
    log_format: str,
) -> None:
    level = getattr(logging, log_level.upper(), logging.INFO)
    logging.basicConfig(level=level, format="%(message)s", stream=sys.stdout, force=True)

    shared_processors: list[structlog.types.Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        _rename_event_to_msg,
        _add_otel_fields,
        structlog.processors.TimeStamper(fmt="iso", key=LOG_FIELDS["time"]),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
    ]

    if log_format.strip().lower() == "json":
        renderer: structlog.types.Processor = structlog.processors.JSONRenderer()
    else:
        renderer = structlog.dev.ConsoleRenderer()

    structlog.configure(
        processors=[
            *shared_processors,
            structlog.processors.CallsiteParameterAdder(
                {
                    structlog.processors.CallsiteParameter.FUNC_NAME: LOG_FIELDS[
                        "context"
                    ],
                }
            ),
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        wrapper_class=structlog.stdlib.BoundLogger,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )

    formatter = structlog.stdlib.ProcessorFormatter(
        foreign_pre_chain=[
            structlog.stdlib.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", key=LOG_FIELDS["time"]),
        ],
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            lambda _l, _m, ed: {LOG_FIELDS["service"]: service_name, **ed},
            renderer,
        ],
    )

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)
    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(level)


def get_logger(name: str) -> structlog.stdlib.BoundLogger:
    return structlog.get_logger(name)


def sample_log_event(service_name: str) -> dict[str, Any]:
    """Build a representative log dict for schema conformance tests."""
    return {
        LOG_FIELDS["time"]: datetime.now(UTC).isoformat(),
        LOG_FIELDS["level"]: "info",
        LOG_FIELDS["service"]: service_name,
        LOG_FIELDS["msg"]: "schema conformance sample",
        LOG_FIELDS["trace_id"]: "0" * 32,
        LOG_FIELDS["span_id"]: "0" * 16,
        LOG_FIELDS["request_id"]: "00000000-0000-4000-8000-000000000000",
    }


def load_log_schema_fixture() -> dict[str, Any]:
    return json.loads(_SCHEMA_FIXTURE.read_text(encoding="utf-8"))
