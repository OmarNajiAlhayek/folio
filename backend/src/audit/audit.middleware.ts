import { Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NextFunction, Request, Response } from 'express';
import type { RequestUser } from '../common/types/request-user';
import { classifyAuditAction } from './audit-action';
import { AuditLogService } from './audit-log.service';

/** Credentials and one-time secrets. Never stored, in any form. */
const SECRET_KEYS = new Set([
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

/**
 * Confidential editorial free text.
 *
 * The audit log answers "who did what, when" — it is not a second copy of the
 * manuscript pipeline. Storing these verbatim put reviewer comments, decision
 * letters and copyedit notes in a table that any journal manager can read via
 * `audit_log.view`, alongside the acting user's id and email. That bypasses the
 * masking in `submission-response.mapper.ts`, where the same text is carefully
 * withheld — a double-anonymous review leaks if the audit log does not respect
 * the same boundary. The key stays in the record so the action is still legible;
 * only the content is dropped.
 */
const CONFIDENTIAL_CONTENT_KEYS = new Set([
  'commentsforauthor',
  'commentstoeditoronly',
  'messageforauthor',
  'noteforauthor',
  'notetoeditoronly',
  'authorresponsetoreviewers',
  'editorinstructions',
  'recommendation',
  'body',
  'subject',
  'abstract',
  'abstractar',
  'constructorcontent',
  'aiusagestatement',
  'conflictofintereststatement',
  'fundingstatement',
]);

function shouldRedact(key: string): boolean {
  const k = key.toLowerCase();
  if (SECRET_KEYS.has(k) || CONFIDENTIAL_CONTENT_KEYS.has(k)) return true;
  // Catches newPassword / currentPassword / confirmPassword and friends,
  // which the exact-match set above would miss.
  return k.endsWith('password') || k.endsWith('token') || k.endsWith('secret');
}

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
    if (shouldRedact(key)) {
      result[key] = '[REDACTED]';
    } else if (Array.isArray(value)) {
      // Arrays were previously stored whole — `contributors` carries names and
      // email addresses, so recurse into their objects too.
      result[key] = (value as unknown[]).map((item) =>
        item !== null && typeof item === 'object' && !Array.isArray(item)
          ? redactObject(item as Record<string, unknown>)
          : item,
      );
    } else if (value !== null && typeof value === 'object') {
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
  private readonly sampleRate: number;

  constructor(
    private readonly auditLogService: AuditLogService,
    config: ConfigService,
  ) {
    const raw = config.get<string>('AUDIT_SAMPLE_RATE', '1');
    const parsed = parseFloat(raw);
    this.sampleRate =
      Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : 1;
  }

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
      const routePattern = routePatternFromRequest(req);
      const { actionType, resourceType, resourceId } = classifyAuditAction(
        method,
        routePattern,
        path,
        res.statusCode,
        params,
      );

      if (this.sampleRate < 1 && Math.random() >= this.sampleRate) {
        return;
      }

      void this.auditLogService.record({
        userId: user?.sub ?? null,
        userEmail: user?.email ?? null,
        userRoles: user?.roleSlugs ?? null,
        method,
        routePattern,
        path,
        statusCode: res.statusCode,
        ipAddress,
        userAgent,
        requestBody,
        params,
        durationMs: Date.now() - startTime,
        error: res.statusCode >= 400 ? `HTTP ${res.statusCode}` : null,
        actionType,
        resourceType,
        resourceId,
      });
    });

    next();
  }
}
