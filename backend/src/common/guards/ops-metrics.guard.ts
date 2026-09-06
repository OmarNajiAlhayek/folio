import { timingSafeEqual } from 'crypto';
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export const OPS_METRICS_HEADER = 'x-folio-ops-token';

/**
 * Optional shared-secret gate for the detailed operational endpoints
 * (`/health/outbox`, `/health/ai-jobs`).
 *
 * These return queue depth, dead-letter counts and per-row attempt counts.
 * That is not PII, but it tells an outsider whether mail delivery is broken and
 * how far behind the pipeline is — useful reconnaissance, and there is no
 * reason for it to be world-readable on a deployed instance.
 *
 * Deliberately opt-in: they are documented as public in `docs/API-NOTES.md`,
 * probed by the k6 harness and the e2e suite, and scraped by monitoring. When
 * `OPS_METRICS_TOKEN` is unset the endpoints behave exactly as before, so local
 * development and CI are unaffected. Set it in a real deployment and give the
 * value to the monitor. `GET /health` (plain liveness) is never gated.
 */
@Injectable()
export class OpsMetricsGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = (
      this.config.get<string>('OPS_METRICS_TOKEN') ?? ''
    ).trim();
    if (expected === '') {
      return true;
    }

    const req = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
    }>();
    const raw = req.headers[OPS_METRICS_HEADER];
    const provided = (Array.isArray(raw) ? raw[0] : raw) ?? '';

    if (!constantTimeEquals(provided, expected)) {
      throw new UnauthorizedException({
        message: `Invalid or missing ${OPS_METRICS_HEADER}`,
        code: 'OPS_TOKEN_INVALID',
      });
    }
    return true;
  }
}

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  // timingSafeEqual throws on length mismatch, which would itself leak length.
  if (left.length !== right.length) {
    // Compare against self to keep the work constant, then fail.
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}
