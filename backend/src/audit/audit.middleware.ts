import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import type { RequestUser } from '../common/types/request-user';
import { AuditLogService } from './audit-log.service';

const REDACTED_KEYS = new Set([
  'password',
  'passwordhash',
  'token',
  'refreshtoken',
  'secret',
  'otp',
  'code',
  'hash',
  'authorization',
]);

function routePatternFromRequest(req: Request): string | null {
  const route = req.route as { path?: unknown } | undefined;
  return typeof route?.path === 'string' ? route.path : null;
}

function extractIp(req: Request): string | null {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const first = Array.isArray(forwarded)
      ? forwarded[0]
      : forwarded.split(',')[0];
    return first?.trim().slice(0, 64) ?? null;
  }
  return (req.socket?.remoteAddress ?? req.ip ?? null)?.slice(0, 64) ?? null;
}

function redactObject(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (REDACTED_KEYS.has(key.toLowerCase())) {
      result[key] = '[REDACTED]';
    } else if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value)
    ) {
      result[key] = redactObject(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function sanitizeBody(req: Request): Record<string, unknown> | null {
  if (req.is('multipart/form-data')) return null;
  const body = req.body as unknown;
  if (body == null || typeof body !== 'object' || Array.isArray(body))
    return null;
  const sanitized = redactObject(body as Record<string, unknown>);
  if (JSON.stringify(sanitized).length > 8192) return { _truncated: true };
  return sanitized;
}

type AugmentedRequest = Request & {
  user?: RequestUser;
  route?: { path?: string };
};

@Injectable()
export class AuditMiddleware implements NestMiddleware {
  constructor(private readonly auditLogService: AuditLogService) {}

  use(req: AugmentedRequest, res: Response, next: NextFunction): void {
    if (
      req.method === 'OPTIONS' ||
      req.headers['accept'] === 'text/event-stream' ||
      req.headers['upgrade']?.toLowerCase() === 'websocket' ||
      req.path?.startsWith('/api/v1/health')
    ) {
      return next();
    }

    const startTime = Date.now();
    const method = req.method;
    const path = req.path;
    const ipAddress = extractIp(req);
    const userAgent = req.headers['user-agent']?.slice(0, 512) ?? null;
    // Body is captured now (before handler may mutate it); user is read in finish callback
    // because guards run after middleware and populate req.user before the response is sent.
    const requestBody = sanitizeBody(req);

    res.on('finish', () => {
      const user = req.user;
      const rawParams = (req.params ?? {}) as Record<string, unknown>;
      const params = Object.keys(rawParams).length > 0 ? rawParams : null;

      void this.auditLogService.record({
        userId: user?.sub ?? null,
        userEmail: user?.email ?? null,
        userRoles: user?.roleSlugs ?? null,
        method,
        routePattern: routePatternFromRequest(req),
        path,
        statusCode: res.statusCode,
        ipAddress,
        userAgent,
        requestBody,
        params,
        durationMs: Date.now() - startTime,
        error: res.statusCode >= 400 ? `HTTP ${res.statusCode}` : null,
      });
    });

    next();
  }
}
