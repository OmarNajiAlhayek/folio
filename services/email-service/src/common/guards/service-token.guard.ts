import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ServiceTokenGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const token = this.config.get<string>('EMAIL_SERVICE_TOKEN', '').trim();
    if (!token) {
      throw new UnauthorizedException({
        message: 'EMAIL_SERVICE_TOKEN is not configured',
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
