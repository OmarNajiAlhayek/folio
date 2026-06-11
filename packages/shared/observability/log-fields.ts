/**
 * Fixed JSON log field names shared across Folio services.
 * TypeScript (Pino) and Python (structlog) must emit these keys on every line.
 */
export const LOG_FIELDS = {
  time: 'time',
  level: 'level',
  service: 'service',
  traceId: 'trace_id',
  spanId: 'span_id',
  requestId: 'request_id',
  context: 'context',
  msg: 'msg',
  err: 'err',
} as const;

export type LogFieldKey = (typeof LOG_FIELDS)[keyof typeof LOG_FIELDS];

/** Required on every structured log line (values may be omitted when unavailable). */
export const REQUIRED_LOG_FIELD_KEYS: readonly LogFieldKey[] = [
  LOG_FIELDS.time,
  LOG_FIELDS.level,
  LOG_FIELDS.service,
  LOG_FIELDS.msg,
] as const;

/** Present when inside an active trace span. */
export const TRACE_LOG_FIELD_KEYS: readonly LogFieldKey[] = [
  LOG_FIELDS.traceId,
  LOG_FIELDS.spanId,
] as const;
