import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hasAnyPermission } from '../authorization/permission-checks';
import { ALLOW_AUTHENTICATED_KEY } from '../decorators/allow-authenticated.decorator';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import type { RequestUser } from '../types/request-user';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required?.length) {
      const allowAuthenticated = this.reflector.getAllAndOverride<boolean>(
        ALLOW_AUTHENTICATED_KEY,
        [context.getHandler(), context.getClass()],
      );
      if (allowAuthenticated) {
        return true;
      }
      throw new ForbiddenException({
        message: 'Route requires explicit permissions',
        code: 'FORBIDDEN',
      });
    }
    const req = context.switchToHttp().getRequest<{ user?: RequestUser }>();
    const user = req.user;
    if (!user) {
      throw new ForbiddenException({
        message: 'Forbidden',
        code: 'FORBIDDEN',
      });
    }
    // OR: see JSDoc on @Permissions() and docs/authorization.md
    const ok = hasAnyPermission(user, required);
    if (!ok) {
      throw new ForbiddenException({
        message: 'Insufficient permissions',
        code: 'FORBIDDEN',
      });
    }
    return true;
  }
}
