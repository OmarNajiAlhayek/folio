import { context, trace, SpanStatusCode } from '@opentelemetry/api';

/** Start a root span for background work (outbox drain, schedulers) with no parent trace. */
export async function withRootSpan<T>(
  name: string,
  attributes: Record<string, string | number | boolean>,
  fn: () => Promise<T>,
): Promise<T> {
  const tracer = trace.getTracer('folio-background');
  return tracer.startActiveSpan(name, { attributes }, async (span) => {
    try {
      return await context.with(trace.setSpan(context.active(), span), fn);
    } catch (err) {
      if (err instanceof Error) {
        span.recordException(err);
      }
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw err;
    } finally {
      span.end();
    }
  });
}
