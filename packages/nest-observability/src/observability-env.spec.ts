import { resolveTraceExportConfig } from './observability-env';

describe('resolveTraceExportConfig', () => {
  it('disables export when OTEL_TRACES_EXPORTER is none', () => {
    expect(
      resolveTraceExportConfig({
        OTEL_TRACES_EXPORTER: 'none',
        OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4318/v1/traces',
      }),
    ).toEqual({ enabled: false });
  });

  it('disables export when exporter is otlp but endpoint is empty', () => {
    expect(
      resolveTraceExportConfig({
        OTEL_TRACES_EXPORTER: 'otlp',
        OTEL_EXPORTER_OTLP_ENDPOINT: '',
      }),
    ).toEqual({ enabled: false });
  });

  it('enables export only when exporter and endpoint are both set', () => {
    expect(
      resolveTraceExportConfig({
        OTEL_TRACES_EXPORTER: 'otlp',
        OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4318/v1/traces',
      }),
    ).toEqual({
      enabled: true,
      endpoint: 'http://collector:4318/v1/traces',
    });
  });
});
