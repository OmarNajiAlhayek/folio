import { context, propagation, trace, TraceFlags } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import {
  injectTraceContextIntoAmqpHeaders,
  withAmqpConsumerContext,
} from './amqp-context';
import { LOG_FIELDS } from './log-fields';

describe('amqp-context', () => {
  const parentTraceId = '4bf92f3577b34da6a3ce929d0e0e4736';
  const parentSpanId = '00f067aa0ba902b7';
  let provider: BasicTracerProvider;

  beforeEach(() => {
    const contextManager = new AsyncLocalStorageContextManager();
    contextManager.enable();
    context.setGlobalContextManager(contextManager);
    propagation.setGlobalPropagator(new W3CTraceContextPropagator());
    provider = new BasicTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(new InMemorySpanExporter())],
    });
    trace.setGlobalTracerProvider(provider);
  });

  afterEach(() => {
    void provider.shutdown();
  });

  function withMockActiveSpan<T>(fn: () => Promise<T> | T): Promise<T> | T {
    const span = trace.wrapSpanContext({
      traceId: parentTraceId,
      spanId: parentSpanId,
      traceFlags: TraceFlags.SAMPLED,
    });
    return context.with(trace.setSpan(context.active(), span), fn);
  }

  it('injectTraceContextIntoAmqpHeaders round-trips through consumer context', async () => {
    await withMockActiveSpan(async () => {
      const injected = injectTraceContextIntoAmqpHeaders({});

      let traceIdInsideConsumer: string | undefined;
      await withAmqpConsumerContext(
        injected,
        { queue: 'test.q', operation: 'test' },
        async () => {
          const active = trace.getSpan(context.active());
          traceIdInsideConsumer = active?.spanContext().traceId;
        },
      );

      expect(traceIdInsideConsumer).toBe(parentTraceId);
    });
  });

  it('withAmqpConsumerContext keeps active span for nested log mixin fields', async () => {
    await withMockActiveSpan(async () => {
      const injected = injectTraceContextIntoAmqpHeaders({});

      await withAmqpConsumerContext(
        injected,
        { queue: 'jobs.q', operation: 'ai.job' },
        async () => {
          const span = trace.getSpan(context.active());
          expect(span?.spanContext().traceId).toBeTruthy();
          expect(span?.spanContext().spanId).toBeTruthy();
          expect(LOG_FIELDS.traceId).toBe('trace_id');
        },
      );
    });
  });
});
