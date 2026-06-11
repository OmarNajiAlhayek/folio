import * as fs from 'fs';
import * as path from 'path';
import { context, trace } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { LOG_FIELDS } from '@folio/shared/observability';
import { createLogMixin } from './log-mixin';

const schemaPath = path.join(
  __dirname,
  '../../shared/observability/log-schema.fixture.json',
);

describe('structured log schema conformance', () => {
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8')) as {
    requiredKeys: string[];
    optionalKeys: string[];
  };

  beforeEach(() => {
    const contextManager = new AsyncLocalStorageContextManager();
    contextManager.enable();
    context.setGlobalContextManager(contextManager);
    const provider = new BasicTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(new InMemorySpanExporter())],
    });
    trace.setGlobalTracerProvider(provider);
  });

  it('mixin emits schema trace fields inside an active span', () => {
    const mixin = createLogMixin();
    const tracer = trace.getTracer('test');

    tracer.startActiveSpan('test', (span) => {
      const fields = mixin();
      expect(fields[LOG_FIELDS.traceId]).toBe(span.spanContext().traceId);
      expect(fields[LOG_FIELDS.spanId]).toBe(span.spanContext().spanId);

      const sample = {
        [LOG_FIELDS.time]: new Date().toISOString(),
        [LOG_FIELDS.level]: 'info',
        [LOG_FIELDS.service]: 'folio-backend',
        [LOG_FIELDS.msg]: 'test',
        ...fields,
      };

      for (const key of schema.requiredKeys) {
        expect(sample).toHaveProperty(key);
      }

      span.end();
    });
  });
});
