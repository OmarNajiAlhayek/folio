import { context, diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { GrpcInstrumentation } from '@opentelemetry/instrumentation-grpc';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import {
  ATTR_SERVICE_NAME,
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
} from '@opentelemetry/semantic-conventions';
import { resolveTraceExportConfig } from './observability-env';

export type InitTelemetryOptions = {
  serviceName: string;
  deploymentEnvironment?: string;
};

let sdk: NodeSDK | null = null;

export function initTelemetry(options: InitTelemetryOptions): void {
  if (sdk) return;

  const exportConfig = resolveTraceExportConfig();
  const deploymentEnvironment =
    options.deploymentEnvironment ??
    process.env.NODE_ENV ??
    process.env.APP_ENV ??
    'development';

  const contextManager = new AsyncLocalStorageContextManager();
  contextManager.enable();
  context.setGlobalContextManager(contextManager);

  if (process.env.OTEL_LOG_LEVEL?.trim()) {
    const level = process.env.OTEL_LOG_LEVEL.trim().toUpperCase();
    const mapped =
      level in DiagLogLevel
        ? DiagLogLevel[level as keyof typeof DiagLogLevel]
        : DiagLogLevel.INFO;
    diag.setLogger(new DiagConsoleLogger(), mapped);
  }

  const traceExporter = exportConfig.enabled
    ? new OTLPTraceExporter({ url: exportConfig.endpoint })
    : undefined;

  sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: options.serviceName,
      [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: deploymentEnvironment,
    }),
    traceExporter,
    instrumentations: [
      new HttpInstrumentation(),
      new GrpcInstrumentation(),
      // AMQP: manual inject/extract in RabbitMQ wrappers (no amqplib auto-instrumentation).
    ],
  });

  sdk.start();
}

export async function shutdownTelemetry(): Promise<void> {
  if (!sdk) return;
  const current = sdk;
  sdk = null;
  await current.shutdown();
}
