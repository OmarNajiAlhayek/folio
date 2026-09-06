/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/unbound-method */
import { EventEmitter } from 'events';
import type { NextFunction } from 'express';
import type { ConfigService } from '@nestjs/config';
import type { AuditLogService } from './audit-log.service';
import { AuditMiddleware } from './audit.middleware';

function makeConfig(sampleRate = '1') {
  return {
    get: jest.fn(
      (_key: string, defaultVal?: string) => defaultVal ?? sampleRate,
    ),
  } as unknown as ConfigService;
}

function makeMiddleware(svc: AuditLogService, sampleRate = '1') {
  return new AuditMiddleware(svc, makeConfig(sampleRate));
}

function makeRes(statusCode = 200) {
  const emitter = new EventEmitter();
  return Object.assign(emitter, { statusCode });
}

function makeReq(overrides: Record<string, unknown> = {}) {
  return {
    method: 'POST',
    path: '/api/v1/submissions',
    headers: {},
    params: {},
    body: {},
    socket: { remoteAddress: '10.0.0.1' },
    ip: '10.0.0.1',
    is: jest.fn(() => false),
    route: { path: '/api/v1/submissions' },
    ...overrides,
  };
}

function makeService() {
  return {
    record: jest.fn().mockResolvedValue(undefined),
  } as unknown as AuditLogService;
}

const next: NextFunction = jest.fn();

describe('AuditMiddleware — skip conditions', () => {
  it('skips OPTIONS requests', () => {
    const svc = makeService();
    const mw = makeMiddleware(svc);
    const req = makeReq({ method: 'OPTIONS' });
    const res = makeRes();
    mw.use(req as never, res as never, next);
    res.emit('finish');
    expect(svc.record).not.toHaveBeenCalled();
  });

  it('skips SSE connections', () => {
    const svc = makeService();
    const mw = makeMiddleware(svc);
    const req = makeReq({ headers: { accept: 'text/event-stream' } });
    const res = makeRes();
    mw.use(req as never, res as never, next);
    res.emit('finish');
    expect(svc.record).not.toHaveBeenCalled();
  });

  it('skips WebSocket upgrades', () => {
    const svc = makeService();
    const mw = makeMiddleware(svc);
    const req = makeReq({ headers: { upgrade: 'websocket' } });
    const res = makeRes();
    mw.use(req as never, res as never, next);
    res.emit('finish');
    expect(svc.record).not.toHaveBeenCalled();
  });

  it('skips health check paths', () => {
    const svc = makeService();
    const mw = makeMiddleware(svc);
    const req = makeReq({ path: '/api/v1/health' });
    const res = makeRes();
    mw.use(req as never, res as never, next);
    res.emit('finish');
    expect(svc.record).not.toHaveBeenCalled();
  });

  it('always calls next()', () => {
    const svc = makeService();
    const mw = makeMiddleware(svc);
    const nextFn = jest.fn();
    mw.use(makeReq() as never, makeRes() as never, nextFn);
    expect(nextFn).toHaveBeenCalled();
  });
});

describe('AuditMiddleware — success recording', () => {
  it('records after finish with correct fields', () => {
    const svc = makeService();
    const mw = makeMiddleware(svc);
    const user = {
      sub: 'uid-1',
      email: 'user@test.dev',
      roleSlugs: ['author'],
      permissionSlugs: [],
    };
    const req = makeReq({ user });
    const res = makeRes(201);
    mw.use(req as never, res as never, next);
    res.emit('finish');

    expect(svc.record).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'uid-1',
        userEmail: 'user@test.dev',
        userRoles: ['author'],
        method: 'POST',
        statusCode: 201,
        error: null,
        durationMs: expect.any(Number),
      }),
    );
  });

  it('reads req.user at finish time — captures user set by guards after middleware ran', () => {
    const svc = makeService();
    const mw = makeMiddleware(svc);
    const req = makeReq(); // no user initially
    const res = makeRes(200);
    mw.use(req as never, res as never, next);

    // Simulate guard setting req.user AFTER middleware ran
    (req as Record<string, unknown>).user = {
      sub: 'late-uid',
      email: 'late@test.dev',
      roleSlugs: ['editor'],
      permissionSlugs: [],
    };
    res.emit('finish');

    expect(svc.record).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'late-uid',
        userEmail: 'late@test.dev',
      }),
    );
  });

  it('logs userId null for unauthenticated paths (e.g. 401)', () => {
    const svc = makeService();
    const mw = makeMiddleware(svc);
    const req = makeReq({ path: '/api/v1/auth/login' }); // no user set (guard rejected)
    const res = makeRes(401);
    mw.use(req as never, res as never, next);
    res.emit('finish');

    expect(svc.record).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: null,
        statusCode: 401,
        error: 'HTTP 401',
      }),
    );
  });

  it('sets error field for 4xx/5xx responses', () => {
    const svc = makeService();
    const mw = makeMiddleware(svc);
    const req = makeReq();
    const res = makeRes(403);
    mw.use(req as never, res as never, next);
    res.emit('finish');

    expect(svc.record).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403, error: 'HTTP 403' }),
    );
  });

  it('sets error null for 2xx responses', () => {
    const svc = makeService();
    const mw = makeMiddleware(svc);
    const res = makeRes(200);
    mw.use(makeReq() as never, res as never, next);
    res.emit('finish');

    expect(svc.record).toHaveBeenCalledWith(
      expect.objectContaining({ error: null }),
    );
  });
});

describe('AuditMiddleware — body sanitization', () => {
  it('redacts password in request body', () => {
    const svc = makeService();
    const mw = makeMiddleware(svc);
    const req = makeReq({ body: { email: 'a@b.com', password: 'hunter2' } });
    const res = makeRes(200);
    mw.use(req as never, res as never, next);
    res.emit('finish');

    const entry = (svc.record as jest.Mock).mock.calls[0][0];
    expect(entry.requestBody).toEqual({
      email: 'a@b.com',
      password: '[REDACTED]',
    });
  });

  it('returns null body for multipart uploads', () => {
    const svc = makeService();
    const mw = makeMiddleware(svc);
    const req = makeReq({ is: jest.fn(() => true) });
    const res = makeRes(201);
    mw.use(req as never, res as never, next);
    res.emit('finish');

    expect((svc.record as jest.Mock).mock.calls[0][0].requestBody).toBeNull();
  });
});

describe('AuditMiddleware — IP extraction', () => {
  it('prefers x-forwarded-for over socket address', () => {
    const svc = makeService();
    const mw = makeMiddleware(svc);
    const req = makeReq({
      headers: { 'x-forwarded-for': '203.0.113.5, 10.0.0.1' },
      socket: { remoteAddress: '10.0.0.1' },
    });
    const res = makeRes(200);
    mw.use(req as never, res as never, next);
    res.emit('finish');

    expect((svc.record as jest.Mock).mock.calls[0][0].ipAddress).toBe(
      '203.0.113.5',
    );
  });
});

describe('AuditMiddleware — confidential editorial content', () => {
  function bodyRecordedFor(body: Record<string, unknown>) {
    const svc = makeService();
    const mw = makeMiddleware(svc);
    const req = makeReq({ body });
    const res = makeRes(201);
    mw.use(req as never, res as never, next);
    res.emit('finish');
    return (svc.record as jest.Mock).mock.calls[0][0].requestBody as Record<
      string,
      unknown
    >;
  }

  it('does not store reviewer comments or the recommendation', () => {
    const recorded = bodyRecordedFor({
      commentsForAuthor: 'The methodology in section 3 is unsound.',
      commentsToEditorOnly: 'I suspect this overlaps the authors 2021 paper.',
      recommendation: 'reject',
    });
    expect(recorded).toEqual({
      commentsForAuthor: '[REDACTED]',
      commentsToEditorOnly: '[REDACTED]',
      recommendation: '[REDACTED]',
    });
  });

  it('does not store the decision letter sent to the author', () => {
    expect(
      bodyRecordedFor({ status: 'rejected', messageForAuthor: 'We regret…' }),
    ).toEqual({ status: 'rejected', messageForAuthor: '[REDACTED]' });
  });

  it('does not store copyedit notes or discussion messages', () => {
    expect(
      bodyRecordedFor({ noteForAuthor: 'x', noteToEditorOnly: 'y', body: 'z' }),
    ).toEqual({
      noteForAuthor: '[REDACTED]',
      noteToEditorOnly: '[REDACTED]',
      body: '[REDACTED]',
    });
  });

  it('catches password variants the exact-match set would miss', () => {
    expect(
      bodyRecordedFor({
        currentPassword: 'a',
        newPassword: 'b',
        resetToken: 'c',
      }),
    ).toEqual({
      currentPassword: '[REDACTED]',
      newPassword: '[REDACTED]',
      resetToken: '[REDACTED]',
    });
  });

  it('recurses into arrays of objects', () => {
    expect(
      bodyRecordedFor({
        contributors: [{ fullName: 'A. Author', password: 'leak' }],
      }),
    ).toEqual({
      contributors: [{ fullName: 'A. Author', password: '[REDACTED]' }],
    });
  });

  it('keeps non-confidential fields so the action stays legible', () => {
    expect(
      bodyRecordedFor({ status: 'under_review', revisionSeverity: 'minor' }),
    ).toEqual({ status: 'under_review', revisionSeverity: 'minor' });
  });
});
