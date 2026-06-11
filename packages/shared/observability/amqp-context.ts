import {
  context,
  propagation,
  trace,
  SpanStatusCode,
} from '@opentelemetry/api';

/** Normalize amqplib header values to strings for W3C propagation. */
export function normalizeAmqpHeaders(
  headers: Record<string, unknown> | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;
  for (const [key, value] of Object.entries(headers)) {
    if (value == null) continue;
    if (typeof value === 'string') {
      out[key] = value;
    } else if (Buffer.isBuffer(value)) {
      out[key] = value.toString('utf8');
    } else {
      out[key] = String(value);
    }
  }
  return out;
}

/** Inject active trace context into AMQP message headers (manual — no amqplib auto-instrumentation). */
export function injectTraceContextIntoAmqpHeaders(
  headers: Record<string, unknown> | undefined,
): Record<string, string> {
  const carrier = normalizeAmqpHeaders(headers);
  propagation.inject(context.active(), carrier);
  return carrier;
}

/** Extract W3C trace context from AMQP headers into an OTel Context. */
export function extractTraceContextFromAmqpHeaders(
  headers: Record<string, unknown> | undefined,
): ReturnType<typeof context.active> {
  const carrier = normalizeAmqpHeaders(headers);
  return propagation.extract(context.active(), carrier);
}

export type AmqpConsumerSpanOptions = {
  queue: string;
  operation: string;
  attributes?: Record<string, string | number | boolean>;
};

/**
 * Run a consumer handler inside extracted trace context + an active consumer span.
 * Ensures Pino mixin / log correlation works inside async AMQP handlers.
 */
export async function withAmqpConsumerContext<T>(
  headers: Record<string, unknown> | undefined,
  options: AmqpConsumerSpanOptions,
  fn: () => Promise<T>,
): Promise<T> {
  const extracted = extractTraceContextFromAmqpHeaders(headers);
  const tracer = trace.getTracer('folio-messaging');

  return context.with(extracted, async () =>
    tracer.startActiveSpan(
      `amqp.consume ${options.operation}`,
      {
        attributes: {
          'messaging.system': 'rabbitmq',
          'messaging.destination': options.queue,
          ...options.attributes,
        },
      },
      async (span) => {
        try {
          return await fn();
        } catch (err) {
          if (err instanceof Error) {
            span.recordException(err);
          }
          span.setStatus({ code: SpanStatusCode.ERROR });
          throw err;
        }
      },
    ),
  );
}
