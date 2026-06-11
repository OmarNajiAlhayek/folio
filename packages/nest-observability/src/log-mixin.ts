import { context, trace } from '@opentelemetry/api';
import { LOG_FIELDS } from '@folio/shared/observability';
import type { ClsReader } from './folio-logger.options';

export function createLogMixin(cls?: ClsReader) {
  return () => {
    const fields: Record<string, string> = {};

    const span = trace.getSpan(context.active());
    if (span) {
      const spanContext = span.spanContext();
      if (spanContext.traceId) {
        fields[LOG_FIELDS.traceId] = spanContext.traceId;
      }
      if (spanContext.spanId) {
        fields[LOG_FIELDS.spanId] = spanContext.spanId;
      }
    }

    if (cls) {
      const requestId = cls.get<string>('requestId');
      if (requestId) {
        fields[LOG_FIELDS.requestId] = requestId;
      }
    }

    return fields;
  };
}
