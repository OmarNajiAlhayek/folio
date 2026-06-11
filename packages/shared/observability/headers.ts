/** Canonical HTTP/gRPC metadata header names — keep in sync with docs/OBSERVABILITY.md */
export const FOLIO_REQUEST_ID_HEADER = 'x-request-id' as const;

/** W3C Trace Context — https://www.w3.org/TR/trace-context/ */
export const TRACEPARENT_HEADER = 'traceparent' as const;
export const TRACESTATE_HEADER = 'tracestate' as const;

/** Existing inter-service auth (ai-service gRPC) */
export const FOLIO_SERVICE_TOKEN_HEADER = 'x-folio-service-token' as const;

export const FOLIO_OBSERVABILITY_HEADERS = [
  FOLIO_REQUEST_ID_HEADER,
  TRACEPARENT_HEADER,
  TRACESTATE_HEADER,
] as const;
