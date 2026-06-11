"""Fixed JSON log field names — keep in sync with packages/shared/observability/log-fields.ts."""

LOG_FIELDS = {
    "time": "time",
    "level": "level",
    "service": "service",
    "trace_id": "trace_id",
    "span_id": "span_id",
    "request_id": "request_id",
    "context": "context",
    "msg": "msg",
    "err": "err",
}

REQUIRED_LOG_KEYS = ("time", "level", "service", "msg")
