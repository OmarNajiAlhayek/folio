from __future__ import annotations

from app.observability.log_fields import LOG_FIELDS, REQUIRED_LOG_KEYS
from app.observability.logging import load_log_schema_fixture, sample_log_event
from app.observability.telemetry import resolve_trace_export_config


def test_log_event_matches_shared_schema_fixture() -> None:
    schema = load_log_schema_fixture()
    sample = sample_log_event("folio-ai-service")
    allowed_keys = set(schema["requiredKeys"]) | set(schema["optionalKeys"])

    for key in schema["requiredKeys"]:
        assert key in sample
        assert key in REQUIRED_LOG_KEYS or key in LOG_FIELDS.values()

    for key in sample:
        assert key in allowed_keys


def test_trace_export_config_exporter_is_authoritative() -> None:
    assert resolve_trace_export_config({"OTEL_TRACES_EXPORTER": "none"}) == {
        "enabled": False,
        "endpoint": None,
    }
    assert resolve_trace_export_config(
        {
            "OTEL_TRACES_EXPORTER": "otlp",
            "OTEL_EXPORTER_OTLP_ENDPOINT": "",
        }
    ) == {
        "enabled": False,
        "endpoint": None,
    }
    assert resolve_trace_export_config(
        {
            "OTEL_TRACES_EXPORTER": "otlp",
            "OTEL_EXPORTER_OTLP_ENDPOINT": "http://localhost:4318/v1/traces",
        }
    ) == {
        "enabled": True,
        "endpoint": "http://localhost:4318/v1/traces",
    }
