import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import type { Request } from 'express';
import { jwtFromCookieOrBearer } from '../jwt-from-request.util';
import { RevokedTokensService } from '../revoked-tokens.service';
import { UsersService } from '../../users/users.service';
import { RbacService } from '../../rbac/rbac.service';

export type JwtPayload = {
  sub: string;
  email: string;
  jti: string;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly usersService: UsersService,
    private readonly rbacService: RbacService,
    private readonly revokedTokens: RevokedTokensService,
  ) {
    super({
      jwtFromRequest: (req: Request) => jwtFromCookieOrBearer(req),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    if (!payload.jti) {
      throw new UnauthorizedException({
        message: 'Invalid token',
        code: 'UNAUTHORIZED',
      });
    }
    if (await this.revokedTokens.isRevoked(payload.jti)) {
      throw new UnauthorizedException({
        message: 'Session ended',
        code: 'UNAUTHORIZED',
      });
    }
    const user = await this.usersService.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException({
        message: 'User not found',
        code: 'UNAUTHORIZED',
      });
    }
    const { roleSlugs, permissionSlugs } =
      await this.rbacService.getEffectiveForUser(user.id);
    return {
      sub: user.id,
      email: user.email,
      roleSlugs,
      permissionSlugs,
    };
  }
}
