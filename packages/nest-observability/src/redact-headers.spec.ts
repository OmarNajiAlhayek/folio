import { buildFolioLoggerModuleOptions } from './folio-logger.options';
import {
  REDACTED,
  redactSensitiveHeaders,
  SENSITIVE_HEADERS,
} from './redact-headers';

describe('redactSensitiveHeaders', () => {
  it('removes every credential-bearing header value', () => {
    const out = redactSensitiveHeaders({
      cookie: 'folio_access=eyJhbGciOi; folio_refresh=abc',
      authorization: 'Bearer eyJhbGciOi',
      'x-folio-service-token': 'shared-secret',
      'x-folio-ops-token': 'ops-secret',
      'x-csrf-token': 'csrf-value',
      'proxy-authorization': 'Basic abc',
    }) as Record<string, unknown>;

    for (const value of Object.values(out)) {
      expect(value).toBe(REDACTED);
    }
  });

  it('keeps the header name so a log still shows the request was authenticated', () => {
    const out = redactSensitiveHeaders({ cookie: 'folio_access=secret' });

    expect(Object.keys(out ?? {})).toEqual(['cookie']);
  });

  it('leaves diagnostic headers untouched', () => {
    const out = redactSensitiveHeaders({
      'user-agent': 'curl/8.14.1',
      'content-type': 'application/json',
      referer: 'https://journal.damascus.edu',
    }) as Record<string, unknown>;

    expect(out).toEqual({
      'user-agent': 'curl/8.14.1',
      'content-type': 'application/json',
      referer: 'https://journal.damascus.edu',
    });
  });

  // Node lower-cases inbound header names, but outbound and test-constructed
  // bags do not always.
  it('matches header names case-insensitively', () => {
    const out = redactSensitiveHeaders({
      Cookie: 'folio_access=secret',
      Authorization: 'Bearer secret',
    }) as Record<string, unknown>;

    expect(out.Cookie).toBe(REDACTED);
    expect(out.Authorization).toBe(REDACTED);
  });

  it('does not mutate the caller’s header object', () => {
    const original = { cookie: 'folio_access=secret' };

    redactSensitiveHeaders(original);

    expect(original.cookie).toBe('folio_access=secret');
  });

  it.each([undefined, null])('passes %p through untouched', (value) => {
    expect(redactSensitiveHeaders(value as undefined)).toBe(value);
  });
});

/**
 * The serializers are the part that actually protects production, so assert on
 * them rather than only on the helper: a correct helper wired to nothing still
 * leaks.
 */
describe('folio logger serializers', () => {
  const config = { get: () => undefined };
  const cls = { get: () => undefined };

  function serializers() {
    const options = buildFolioLoggerModuleOptions(config, cls, {
      serviceName: 'folio-test',
    });
    return options.pinoHttp.serializers as {
      req: (req: unknown) => Record<string, unknown>;
      res: (res: unknown) => Record<string, unknown>;
    };
  }

  it('redacts request credentials while keeping the diagnostic fields', () => {
    const out = serializers().req({
      id: 'req-1',
      method: 'POST',
      url: '/api/v1/submissions',
      query: {},
      params: {},
      headers: {
        cookie: 'folio_access=SENTINEL',
        authorization: 'Bearer SENTINEL',
        'user-agent': 'curl/8.14.1',
      },
      remoteAddress: '127.0.0.1',
      remotePort: 51000,
    });

    const headers = out.headers as Record<string, unknown>;
    expect(headers.cookie).toBe(REDACTED);
    expect(headers.authorization).toBe(REDACTED);
    expect(headers['user-agent']).toBe('curl/8.14.1');
    expect(out.method).toBe('POST');
    expect(out.url).toBe('/api/v1/submissions');
    expect(out.remoteAddress).toBe('127.0.0.1');
  });

  it('redacts set-cookie on the response, where fresh tokens are minted', () => {
    const out = serializers().res({
      statusCode: 200,
      headers: {
        'set-cookie': ['folio_access=NEW_TOKEN; HttpOnly'],
        'content-type': 'application/json',
      },
    });

    const headers = out.headers as Record<string, unknown>;
    expect(headers['set-cookie']).toBe(REDACTED);
    expect(headers['content-type']).toBe('application/json');
    expect(out.statusCode).toBe(200);
  });

  it('falls back to getHeaders() when the response exposes no headers object', () => {
    const out = serializers().res({
      statusCode: 204,
      getHeaders: () => ({ 'set-cookie': 'folio_refresh=NEW' }),
    });

    expect((out.headers as Record<string, unknown>)['set-cookie']).toBe(
      REDACTED,
    );
  });

  // Guards the reason these are serializers and not pino `redact` paths: a path
  // such as `["http.req"].headers.cookie` stops matching if this mapping is
  // renamed, and fails silently when it does.
  it('still renames the output keys, so redaction cannot depend on that mapping', () => {
    const options = buildFolioLoggerModuleOptions(config, cls, {
      serviceName: 'folio-test',
    });

    expect(options.pinoHttp.customAttributeKeys.req).toBe('http.req');
    expect(options.pinoHttp.customAttributeKeys.res).toBe('http.res');
  });

  it('covers every header the guards actually read', () => {
    expect(SENSITIVE_HEADERS.has('x-folio-service-token')).toBe(true);
    expect(SENSITIVE_HEADERS.has('x-folio-ops-token')).toBe(true);
    expect(SENSITIVE_HEADERS.has('x-csrf-token')).toBe(true);
  });
});
