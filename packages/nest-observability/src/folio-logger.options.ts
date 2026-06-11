import {
  FOLIO_REQUEST_ID_HEADER,
  LOG_FIELDS,
  normalizeRequestId,
} from '@folio/shared/observability';
import { createLogMixin } from './log-mixin';
import { resolveLogFormat, resolveLogLevel } from './observability-env';

export type ConfigReader = {
  get: <T = string>(key: string, defaultValue?: T) => T | undefined;
};

/** Minimal CLS surface used by the log mixin (avoids cross-package ClsService typing). */
export type ClsReader = {
  get: <T = unknown>(key: string | symbol) => T | undefined;
};

export type FolioLoggerOptionsInput = {
  serviceName: string;
};

/** Factory for `LoggerModule.forRootAsync` — pair with host-resolved ConfigModule + ClsModule imports. */
export function folioLoggerUseFactory(serviceName: string) {
  return (config: ConfigReader, cls: ClsReader) =>
    buildFolioLoggerModuleOptions(config, cls, { serviceName });
}

export function buildFolioLoggerModuleOptions(
  config: ConfigReader,
  cls: ClsReader,
  input: FolioLoggerOptionsInput,
) {
  const logFormat = resolveLogFormat();
  const logLevel = resolveLogLevel();
  const serviceName =
    config.get<string>('OTEL_SERVICE_NAME') ?? input.serviceName;

  return {
    pinoHttp: {
      level: logLevel,
      mixin: createLogMixin(cls),
      customProps: () => ({
        [LOG_FIELDS.service]: serviceName,
      }),
      genReqId: (req: {
        headers: Record<string, string | string[] | undefined>;
      }) =>
        normalizeRequestId(req.headers[FOLIO_REQUEST_ID_HEADER]?.toString()),
      customAttributeKeys: {
        req: 'http.req',
        res: 'http.res',
        err: LOG_FIELDS.err,
        responseTime: 'http.responseTime',
      },
      serializers: {
        err: (err: Error) => ({
          type: err.name,
          message: err.message,
          stack: err.stack,
        }),
      },
      transport:
        logFormat === 'pretty'
          ? {
              target: 'pino-pretty',
              options: {
                colorize: true,
                singleLine: true,
                ignore: 'pid,hostname',
              },
            }
          : undefined,
    },
  };
}
