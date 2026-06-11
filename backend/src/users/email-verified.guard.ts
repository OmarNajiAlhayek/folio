import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import type { RequestUser } from '../common/types/request-user';
import { UsersService } from './users.service';

@Injectable()
export class EmailVerifiedGuard implements CanActivate {
  constructor(private readonly usersService: UsersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: RequestUser }>();
    const userId = req.user?.sub;
    if (!userId) {
      return true;
    }
    const user = await this.usersService.findById(userId);
    if (!user || !this.usersService.isEmailVerified(user)) {
      throw new ForbiddenException({
        message: 'Verify your email address to continue',
        code: 'EMAIL_NOT_VERIFIED',
      });
    }
    return true;
  }
}
