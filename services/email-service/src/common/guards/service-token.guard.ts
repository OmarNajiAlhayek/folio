import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

function isLoopbackHost(host: string): boolean {
  const h = host.trim().toLowerCase();
  return (
    h === '127.0.0.1' ||
    h === 'localhost' ||
    h === '::1' ||
    h === '0:0:0:0:0:0:0:1'
  );
}

@Injectable()
export class ServiceTokenGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const token = this.config.get<string>('EMAIL_SERVICE_TOKEN', '').trim();
    const bindHost = (
      this.config.get<string>('HTTP_BIND_HOST') ??
      this.config.get<string>('HEALTH_BIND_HOST', '127.0.0.1')
    ).trim();

    if (!token) {
      if (isLoopbackHost(bindHost)) {
        return true;
      }
      throw new UnauthorizedException({
        message:
          'EMAIL_SERVICE_TOKEN is required when bind host is not loopback',
        code: 'SERVICE_TOKEN_REQUIRED',
      });
    }

    const req = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
    }>();
    const header = req.headers['x-folio-service-token'];
    const provided = Array.isArray(header) ? header[0] : header;
    if (provided !== token) {
      throw new UnauthorizedException({
        message: 'Invalid or missing x-folio-service-token',
        code: 'SERVICE_TOKEN_INVALID',
      });
    }
    return true;
  }
}
