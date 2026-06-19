import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import type { Request } from 'express';
import { jwtFromCookieOrBearer } from '../jwt-from-request.util';
import { RevokedTokensService } from '../revoked-tokens.service';

export type JwtPayload = {
  sub: string;
  email: string;
  jti: string;
  roleSlugs: string[];
  permissionSlugs: string[];
};

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
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
    if (
      !isStringArray(payload.roleSlugs) ||
      !isStringArray(payload.permissionSlugs)
    ) {
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
    return {
      sub: payload.sub,
      email: payload.email,
      roleSlugs: payload.roleSlugs,
      permissionSlugs: payload.permissionSlugs,
    };
  }
}
