/**
 * Trace export is controlled solely by OTEL_TRACES_EXPORTER.
 * When set to `otlp`, OTEL_EXPORTER_OTLP_ENDPOINT must also be set or export is disabled.
 */
export type TraceExportConfig = {
  enabled: boolean;
  endpoint?: string;
};

export function resolveTraceExportConfig(
  env: NodeJS.ProcessEnv = process.env,
): TraceExportConfig {
  const exporter = (env.OTEL_TRACES_EXPORTER ?? 'none').trim().toLowerCase();

  if (!exporter || exporter === 'none') {
    return { enabled: false };
  }

  if (exporter !== 'otlp') {
    // eslint-disable-next-line no-console
    console.warn(
      `[folio-observability] Unknown OTEL_TRACES_EXPORTER="${exporter}"; trace export disabled`,
    );
    return { enabled: false };
  }

  const endpoint = env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
  if (!endpoint) {
    // eslint-disable-next-line no-console
    console.warn(
      '[folio-observability] OTEL_TRACES_EXPORTER=otlp but OTEL_EXPORTER_OTLP_ENDPOINT is empty; trace export disabled',
    );
    return { enabled: false };
  }

  return { enabled: true, endpoint };
}

export function resolveLogFormat(
  env: NodeJS.ProcessEnv = process.env,
): 'json' | 'pretty' {
  const raw = (env.LOG_FORMAT ?? 'pretty').trim().toLowerCase();
  return raw === 'json' ? 'json' : 'pretty';
}

export function resolveLogLevel(env: NodeJS.ProcessEnv = process.env): string {
  return (env.LOG_LEVEL ?? 'info').trim().toLowerCase();
}
