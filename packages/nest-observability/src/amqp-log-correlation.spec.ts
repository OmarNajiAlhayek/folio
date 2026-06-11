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
  LOG_FIELDS,
} from '@folio/shared/observability';
import { createLogMixin } from './log-mixin';

describe('AMQP consumer log correlation', () => {
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

  it('emits trace_id from log mixin inside AMQP consumer handler', async () => {
    const mixin = createLogMixin();
    const parentTraceId = '4bf92f3577b34da6a3ce929d0e0e4736';
    const parentSpanId = '00f067aa0ba902b7';
    const parentSpan = trace.wrapSpanContext({
      traceId: parentTraceId,
      spanId: parentSpanId,
      traceFlags: TraceFlags.SAMPLED,
    });

    await context.with(trace.setSpan(context.active(), parentSpan), async () => {
      const injected = injectTraceContextIntoAmqpHeaders({});

      await withAmqpConsumerContext(
        injected,
        { queue: 'folio.test', operation: 'email.event' },
        async () => {
          const fields = mixin();
          expect(fields[LOG_FIELDS.traceId]).toBeTruthy();
          expect(fields[LOG_FIELDS.spanId]).toBeTruthy();

          const active = trace.getSpan(context.active());
          expect(fields[LOG_FIELDS.traceId]).toBe(
            active?.spanContext().traceId,
          );
        },
      );
    });
  });
});
