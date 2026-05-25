import { randomUUID } from 'crypto';
import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { jwtFromCookieOrBearer } from './jwt-from-request.util';
import { RevokedTokensService } from './revoked-tokens.service';
import { JwtPayload } from './strategies/jwt.strategy';

const SALT_ROUNDS = 10;

type VerifiedJwt = JwtPayload & { exp: number };

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly revokedTokens: RevokedTokensService,
  ) {}

  async register(dto: RegisterDto): Promise<{
    accessToken: string;
    user: NonNullable<Awaited<ReturnType<UsersService['toPublicProfile']>>>;
  }> {
    const { email, password, displayName, affiliation, orcid, reviewKeywords } =
      dto;
    const willingToReview = dto.willingToReview === true;
    const existing = await this.usersService.findByEmail(email);
    if (existing) {
      throw new ConflictException({
        message: 'Email already registered',
        code: 'CONFLICT',
      });
    }
    if (orcid) {
      const orcidTaken = await this.usersService.findByOrcid(orcid);
      if (orcidTaken) {
        throw new ConflictException({
          message: 'This ORCID is already linked to an account',
          code: 'CONFLICT',
        });
      }
    }
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await this.usersService.create({
      email,
      passwordHash,
      displayName,
      affiliation: affiliation ?? null,
      orcid: orcid ?? null,
      reviewKeywords: reviewKeywords ?? null,
      willingToReview,
    });
    const accessToken = this.sign(user.id, user.email);
    const profile = await this.usersService.toPublicProfile(user.id);
    if (!profile) {
      throw new UnauthorizedException({
        message: 'Registration failed',
        code: 'UNAUTHORIZED',
      });
    }
    return { accessToken, user: profile };
  }

  async login(
    email: string,
    password: string,
  ): Promise<{
    accessToken: string;
    user: NonNullable<Awaited<ReturnType<UsersService['toPublicProfile']>>>;
  }> {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException({
        message: 'Invalid email or password',
        code: 'UNAUTHORIZED',
      });
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException({
        message: 'Invalid email or password',
        code: 'UNAUTHORIZED',
      });
    }
    const accessToken = this.sign(user.id, user.email);
    const profile = await this.usersService.toPublicProfile(user.id);
    if (!profile) {
      throw new UnauthorizedException({
        message: 'Invalid email or password',
        code: 'UNAUTHORIZED',
      });
    }
    return { accessToken, user: profile };
  }

  /** Revoke the JWT used for this request (per-session logout). */
  async revokeSessionFromRequest(req: Request): Promise<void> {
    const token = jwtFromCookieOrBearer(req);
    if (!token) {
      return;
    }
    try {
      const payload = this.jwtService.verify<VerifiedJwt>(token);
      if (!payload.jti) {
        return;
      }
      await this.revokedTokens.revoke(
        payload.jti,
        payload.sub,
        new Date(payload.exp * 1000),
      );
    } catch (err) {
      this.logger.debug(
        `Logout: could not revoke session (${err instanceof Error ? err.message : String(err)})`,
      );
    }
  }

  private sign(sub: string, email: string): string {
    const payload: JwtPayload = { sub, email, jti: randomUUID() };
    return this.jwtService.sign(payload);
  }
}
