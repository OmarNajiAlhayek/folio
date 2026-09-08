import {
  FOLIO_REQUEST_ID_HEADER,
  LOG_FIELDS,
  normalizeRequestId,
} from '@folio/shared/observability';
import { createLogMixin } from './log-mixin';
import { redactSensitiveHeaders, type HeaderBag } from './redact-headers';
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

/** The request shape pino-http hands to a `req` serializer. */
type LoggedRequest = {
  id?: unknown;
  method?: string;
  url?: string;
  query?: unknown;
  params?: unknown;
  headers?: HeaderBag;
  remoteAddress?: string;
  remotePort?: number;
};

/** The response shape pino-http hands to a `res` serializer. */
type LoggedResponse = {
  statusCode?: number;
  headers?: HeaderBag;
  getHeaders?: () => HeaderBag;
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
        // Mirrors pino-http's default request shape, with credential-bearing
        // headers removed. Redacting here rather than through pino's `redact`
        // paths keeps the fix independent of `customAttributeKeys`: a path like
        // `["http.req"].headers.cookie` silently stops matching the day that
        // mapping changes, and a redaction that silently stops working is worse
        // than none, because nobody re-checks it.
        req: (req: LoggedRequest) => ({
          id: req.id,
          method: req.method,
          url: req.url,
          query: req.query,
          params: req.params,
          headers: redactSensitiveHeaders(req.headers),
          remoteAddress: req.remoteAddress,
          remotePort: req.remotePort,
        }),
        // `set-cookie` on the response to /auth/login and /auth/refresh carries
        // freshly minted tokens, so the response side needs this as much as the
        // request side.
        res: (res: LoggedResponse) => ({
          statusCode: res.statusCode,
          headers: redactSensitiveHeaders(
            res.headers ?? (res.getHeaders ? res.getHeaders() : undefined),
          ),
        }),
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
