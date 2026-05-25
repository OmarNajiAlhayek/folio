import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
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
      return true;
    }
    const req = context.switchToHttp().getRequest<{ user?: RequestUser }>();
    const user = req.user;
    if (!user) {
      throw new ForbiddenException({
        message: 'Forbidden',
        code: 'FORBIDDEN',
      });
    }
    const set = new Set(user.permissionSlugs);
    // OR: see JSDoc on @Permissions()
    const ok = required.some((p) => set.has(p));
    if (!ok) {
      throw new ForbiddenException({
        message: 'Insufficient permissions',
        code: 'FORBIDDEN',
      });
    }
    return true;
  }
}
