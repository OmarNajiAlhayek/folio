import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import * as bcrypt from 'bcrypt';
import { resolveEmailLocale } from '../common/email-locale';
import {
  dashboardPageUrl,
  newSubmissionPageUrl,
  resetPasswordPageUrl,
  verifyEmailPageUrl,
} from '../common/folio-frontend-urls';
import { EventPublisherService } from '../messaging/event-publisher.service';
import {
  ROUTING_KEY,
  type AuthPasswordResetEvent,
  type AuthRegistrationWelcomeEvent,
  type AuthVerificationOtpEvent,
} from '@folio/shared/contracts/email-events';
import {
  authPasswordResetKey,
  authRegistrationWelcomeKey,
  authVerificationOtpKey,
} from '@folio/shared/messaging/idempotency';
import { UsersService } from '../users/users.service';
import { RbacService } from '../rbac/rbac.service';
import { AuthChallengesService } from './auth-challenges.service';
import { RegisterDto } from './dto/register.dto';
import { jwtFromCookieOrBearer } from './jwt-from-request.util';
import { refreshFromCookieOrBody } from './refresh-from-request.util';
import { RevokedTokensService } from './revoked-tokens.service';
import {
  RefreshSessionsService,
  type SessionMeta,
} from './refresh-sessions.service';
import { JwtPayload } from './strategies/jwt.strategy';

const SALT_ROUNDS = 10;

/** Same body for every rejected register — do not confirm that an email or ORCID exists. */
const REGISTRATION_FAILED = {
  message: 'Unable to create this account. If you already have one, sign in.',
  code: 'REGISTRATION_FAILED',
} as const;

type VerifiedJwt = JwtPayload & { exp: number };

export type SessionPair = {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  accessJti: string;
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly rbacService: RbacService,
    private readonly jwtService: JwtService,
    private readonly revokedTokens: RevokedTokensService,
    private readonly refreshSessions: RefreshSessionsService,
    private readonly authChallenges: AuthChallengesService,
    private readonly eventPublisher: EventPublisherService,
    private readonly config: ConfigService,
  ) {}

  private appBaseUrl(): string {
    return (
      this.config.get<string>('APP_BASE_URL') ?? 'http://localhost:5240'
    ).replace(/\/+$/, '');
  }

  async register(
    dto: RegisterDto,
    meta: SessionMeta,
  ): Promise<{
    session: SessionPair;
    user: NonNullable<Awaited<ReturnType<UsersService['toPublicProfile']>>>;
  }> {
    const { email, password, displayName, affiliation, orcid, reviewKeywords } =
      dto;
    const willingToReview = dto.willingToReview === true;
    const existing = await this.usersService.findByEmail(email);
    if (existing) {
      // Same cost as a new account so a timing side-channel does not confirm the email.
      await bcrypt.hash(password, SALT_ROUNDS);
      throw new BadRequestException(REGISTRATION_FAILED);
    }
    const orcidTaken = await this.usersService.findByOrcid(orcid);
    if (orcidTaken) {
      await bcrypt.hash(password, SALT_ROUNDS);
      throw new BadRequestException(REGISTRATION_FAILED);
    }
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await this.usersService.create({
      email,
      passwordHash,
      displayName,
      affiliation: affiliation ?? null,
      orcid,
      reviewKeywords: reviewKeywords ?? null,
      willingToReview,
    });
    const session = await this.issueSessionPair(user.id, user.email, meta);
    await this.enqueueVerificationEmail(user);
    const profile = await this.usersService.toPublicProfile(user.id);
    if (!profile) {
      throw new UnauthorizedException({
        message: 'Registration failed',
        code: 'UNAUTHORIZED',
      });
    }
    return { session, user: profile };
  }

  async login(
    email: string,
    password: string,
    meta: SessionMeta,
  ): Promise<{
    session: SessionPair;
    user: NonNullable<Awaited<ReturnType<UsersService['toPublicProfile']>>>;
  }> {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException({
        message: 'Invalid email or password',
        code: 'UNAUTHORIZED',
      });
    }
    if (!user.passwordHash) {
      throw new UnauthorizedException({
        message: 'This account uses ORCID sign-in',
        code: 'ORCID_SIGN_IN_REQUIRED',
      });
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException({
        message: 'Invalid email or password',
        code: 'UNAUTHORIZED',
      });
    }
    const session = await this.issueSessionPair(user.id, user.email, meta);
    const profile = await this.usersService.toPublicProfile(user.id);
    if (!profile) {
      throw new UnauthorizedException({
        message: 'Invalid email or password',
        code: 'UNAUTHORIZED',
      });
    }
    return { session, user: profile };
  }

  async refreshFromRequest(
    req: Request,
    meta: SessionMeta,
  ): Promise<SessionPair & { userId: string; email: string }> {
    const refreshToken = refreshFromCookieOrBody(req);
    if (!refreshToken) {
      throw new UnauthorizedException({
        message: 'Refresh token required',
        code: 'UNAUTHORIZED',
      });
    }
    const rotated = await this.refreshSessions.rotate(refreshToken, meta);
    const user = await this.usersService.findById(rotated.userId);
    if (!user) {
      throw new UnauthorizedException({
        message: 'User not found',
        code: 'UNAUTHORIZED',
      });
    }
    const { roleSlugs, permissionSlugs } =
      await this.rbacService.getEffectiveForUser(user.id);
    const accessToken = this.sign(
      user.id,
      user.email,
      rotated.accessJti,
      roleSlugs,
      permissionSlugs,
    );
    return {
      accessToken,
      refreshToken: rotated.refreshToken,
      sessionId: rotated.sessionId,
      accessJti: rotated.accessJti,
      userId: user.id,
      email: user.email,
    };
  }

  async listSessions(userId: string, req: Request) {
    const refreshToken = refreshFromCookieOrBody(req);
    const currentSessionId = refreshToken
      ? await this.refreshSessions.resolveSessionId(refreshToken)
      : null;
    return this.refreshSessions.listForUser(
      userId,
      currentSessionId ?? undefined,
    );
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const ok = await this.refreshSessions.revokeById(userId, sessionId);
    if (!ok) {
      throw new NotFoundException({
        message: 'Session not found',
        code: 'NOT_FOUND',
      });
    }
  }

  async revokeOtherSessions(userId: string, req: Request): Promise<number> {
    const refreshToken = refreshFromCookieOrBody(req);
    if (!refreshToken) {
      throw new UnauthorizedException({
        message: 'Refresh token required',
        code: 'UNAUTHORIZED',
      });
    }
    const currentSessionId =
      await this.refreshSessions.resolveSessionId(refreshToken);
    if (!currentSessionId) {
      throw new UnauthorizedException({
        message: 'Invalid refresh token',
        code: 'UNAUTHORIZED',
      });
    }
    return this.refreshSessions.revokeAllExcept(userId, currentSessionId);
  }

  async sendVerificationEmail(userId: string): Promise<{ ok: true }> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException({
        message: 'User not found',
        code: 'NOT_FOUND',
      });
    }
    if (this.usersService.isEmailVerified(user)) {
      return { ok: true };
    }
    await this.enqueueVerificationEmail(user);
    return { ok: true };
  }

  async verifyEmail(
    userId: string,
    code: string,
  ): Promise<
    NonNullable<Awaited<ReturnType<UsersService['toPublicProfile']>>>
  > {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException({
        message: 'User not found',
        code: 'NOT_FOUND',
      });
    }
    if (this.usersService.isEmailVerified(user)) {
      const profile = await this.usersService.toPublicProfile(userId);
      if (!profile) {
        throw new NotFoundException({
          message: 'User not found',
          code: 'NOT_FOUND',
        });
      }
      return profile;
    }
    await this.authChallenges.verifyOtp(userId, code);
    await this.usersService.markEmailVerified(userId);
    await this.enqueueRegistrationWelcomeEmail(user);
    const profile = await this.usersService.toPublicProfile(userId);
    if (!profile) {
      throw new NotFoundException({
        message: 'User not found',
        code: 'NOT_FOUND',
      });
    }
    return profile;
  }

  async forgotPassword(email: string): Promise<{ ok: true }> {
    const user = await this.usersService.findByEmail(email);
    if (user) {
      await this.enqueuePasswordResetEmail(user);
    }
    return { ok: true };
  }

  async validateResetToken(token: string): Promise<{ valid: true }> {
    await this.authChallenges.validateResetToken(token);
    return { valid: true };
  }

  async resetPassword(token: string, password: string): Promise<{ ok: true }> {
    const userId = await this.authChallenges.consumeResetToken(token);
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    await this.usersService.updatePasswordHash(userId, passwordHash);
    await this.refreshSessions.revokeAllForUser(userId);
    return { ok: true };
  }

  /** Revoke the tokens used for this request (per-session logout). */
  async revokeSessionFromRequest(req: Request): Promise<void> {
    const refreshToken = refreshFromCookieOrBody(req);
    if (refreshToken) {
      await this.refreshSessions.revokeByRefreshToken(refreshToken);
    }

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
        `Logout: could not revoke access session (${err instanceof Error ? err.message : String(err)})`,
      );
    }
  }

  async issueSessionForUser(
    userId: string,
    meta: SessionMeta,
  ): Promise<SessionPair> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException({
        message: 'User not found',
        code: 'UNAUTHORIZED',
      });
    }
    return this.issueSessionPair(user.id, user.email, meta);
  }

  async onOAuthUserCreated(userId: string): Promise<void> {
    const user = await this.usersService.findById(userId);
    if (!user) return;
    if (this.usersService.isEmailVerified(user)) {
      await this.enqueueRegistrationWelcomeEmail(user);
    }
  }

  /** Revoke every active session for a user (e.g. after role demotion). */
  async revokeAllSessionsForUser(userId: string): Promise<number> {
    return this.refreshSessions.revokeAllForUser(userId);
  }

  /**
   * Re-sign the current access token with fresh RBAC claims (same jti).
   * Used after permission grants so the caller keeps the same session.
   */
  async reissueAccessForRequest(
    req: Request,
    userId: string,
  ): Promise<{ accessToken: string }> {
    const token = jwtFromCookieOrBearer(req);
    if (!token) {
      throw new UnauthorizedException({
        message: 'Access token required',
        code: 'UNAUTHORIZED',
      });
    }
    let payload: VerifiedJwt;
    try {
      payload = this.jwtService.verify<VerifiedJwt>(token);
    } catch {
      throw new UnauthorizedException({
        message: 'Invalid token',
        code: 'UNAUTHORIZED',
      });
    }
    if (payload.sub !== userId || !payload.jti) {
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
    const { roleSlugs, permissionSlugs } =
      await this.rbacService.getEffectiveForUser(userId);
    const accessToken = this.sign(
      userId,
      payload.email,
      payload.jti,
      roleSlugs,
      permissionSlugs,
    );
    return { accessToken };
  }

  verifyAccessToken(token: string): JwtPayload & { exp: number } {
    return this.jwtService.verify<JwtPayload & { exp: number }>(token);
  }

  async setPassword(userId: string, password: string): Promise<{ ok: true }> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException({
        message: 'User not found',
        code: 'NOT_FOUND',
      });
    }
    if (user.passwordHash) {
      throw new ConflictException({
        message: 'Password is already set',
        code: 'CONFLICT',
      });
    }
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    await this.usersService.updatePasswordHash(userId, passwordHash);
    return { ok: true };
  }

  private async issueSessionPair(
    userId: string,
    email: string,
    meta: SessionMeta,
  ): Promise<SessionPair> {
    const accessJti = randomUUID();
    const created = await this.refreshSessions.createSession(
      userId,
      accessJti,
      meta,
    );
    const { roleSlugs, permissionSlugs } =
      await this.rbacService.getEffectiveForUser(userId);
    const accessToken = this.sign(
      userId,
      email,
      accessJti,
      roleSlugs,
      permissionSlugs,
    );
    return {
      accessToken,
      refreshToken: created.refreshToken,
      sessionId: created.sessionId,
      accessJti,
    };
  }

  private sign(
    sub: string,
    email: string,
    jti: string,
    roleSlugs: string[],
    permissionSlugs: string[],
  ): string {
    const payload: JwtPayload = {
      sub,
      email,
      jti,
      roleSlugs,
      permissionSlugs,
    };
    return this.jwtService.sign(payload);
  }

  private async enqueueVerificationEmail(
    user: NonNullable<Awaited<ReturnType<UsersService['findById']>>>,
  ): Promise<void> {
    const created = await this.authChallenges.createEmailVerificationOtp(
      user.id,
    );
    const siteDefault = this.config.get<string>('DEFAULT_EMAIL_LOCALE', 'en');
    const emailLocale = resolveEmailLocale({
      recipientPreferred: user.preferredLocale,
      siteDefault,
    });
    const payload: AuthVerificationOtpEvent = {
      type: 'AuthVerificationOtp',
      occurredAt: new Date().toISOString(),
      idempotencyKey: authVerificationOtpKey(created.challengeId),
      challengeId: created.challengeId,
      emailLocale,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
      },
      otpCode: created.otpCode,
      verifyUrl: verifyEmailPageUrl(this.appBaseUrl(), emailLocale),
    };
    await this.eventPublisher.enqueue(
      ROUTING_KEY.authVerificationOtp,
      payload as unknown as Record<string, unknown>,
    );
  }

  private async enqueuePasswordResetEmail(
    user: NonNullable<Awaited<ReturnType<UsersService['findById']>>>,
  ): Promise<void> {
    const created = await this.authChallenges.createPasswordResetToken(user.id);
    const siteDefault = this.config.get<string>('DEFAULT_EMAIL_LOCALE', 'en');
    const emailLocale = resolveEmailLocale({
      recipientPreferred: user.preferredLocale,
      siteDefault,
    });
    const payload: AuthPasswordResetEvent = {
      type: 'AuthPasswordReset',
      occurredAt: new Date().toISOString(),
      idempotencyKey: authPasswordResetKey(created.challengeId),
      challengeId: created.challengeId,
      emailLocale,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
      },
      resetUrl: resetPasswordPageUrl(
        this.appBaseUrl(),
        emailLocale,
        created.resetToken,
      ),
    };
    await this.eventPublisher.enqueue(
      ROUTING_KEY.authPasswordReset,
      payload as unknown as Record<string, unknown>,
    );
  }

  private async enqueueRegistrationWelcomeEmail(
    user: NonNullable<Awaited<ReturnType<UsersService['findById']>>>,
  ): Promise<void> {
    const siteDefault = this.config.get<string>('DEFAULT_EMAIL_LOCALE', 'en');
    const emailLocale = resolveEmailLocale({
      recipientPreferred: user.preferredLocale,
      siteDefault,
    });
    const base = this.appBaseUrl();
    const payload: AuthRegistrationWelcomeEvent = {
      type: 'AuthRegistrationWelcome',
      occurredAt: new Date().toISOString(),
      idempotencyKey: authRegistrationWelcomeKey(user.id),
      userId: user.id,
      emailLocale,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
      },
      dashboardUrl: dashboardPageUrl(base, emailLocale),
      newSubmissionUrl: newSubmissionPageUrl(base, emailLocale),
      willingToReview: user.willingToReview,
    };
    await this.eventPublisher.enqueue(
      ROUTING_KEY.authRegistrationWelcome,
      payload as unknown as Record<string, unknown>,
    );
  }
}
