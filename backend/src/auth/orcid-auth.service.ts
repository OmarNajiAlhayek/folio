import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  OAuthIdentity,
  OAUTH_PROVIDER_ORCID,
} from '../entities/oauth-identity.entity';
import { UsersService } from '../users/users.service';
import {
  encodeOAuthState,
  decodeOAuthState,
  type OAuthFlowMode,
} from './oauth-state.util';
import {
  OrcidOAuthService,
  type OrcidPersonProfile,
} from './orcid-oauth.service';
import { type SessionMeta } from './refresh-sessions.service';
import { AuthService, type SessionPair } from './auth.service';

export type OrcidCallbackResult =
  | {
      kind: 'session';
      session: SessionPair;
      userId: string;
      locale: 'en' | 'ar';
      next?: string;
      needsProfileCompletion: boolean;
    }
  | {
      kind: 'linked';
      locale: 'en' | 'ar';
    }
  | {
      kind: 'error';
      code:
        | 'ORCID_STATE_INVALID'
        | 'ORCID_EMAIL_EXISTS'
        | 'ORCID_ALREADY_LINKED'
        | 'ORCID_UNAVAILABLE'
        | 'ORCID_DISABLED';
      locale: 'en' | 'ar';
    };

@Injectable()
export class OrcidAuthService {
  constructor(
    private readonly config: ConfigService,
    private readonly orcidOAuth: OrcidOAuthService,
    private readonly usersService: UsersService,
    private readonly authService: AuthService,
    @InjectRepository(OAuthIdentity)
    private readonly oauthRepo: Repository<OAuthIdentity>,
  ) {}

  assertEnabled(): void {
    if (!this.orcidOAuth.isEnabled()) {
      throw new BadRequestException({
        message: 'ORCID sign-in is not configured',
        code: 'ORCID_DISABLED',
      });
    }
  }

  startUrl(opts: {
    mode: OAuthFlowMode;
    locale: 'en' | 'ar';
    next?: string;
    linkUserId?: string;
  }): string {
    this.assertEnabled();
    const state = encodeOAuthState(
      {
        mode: opts.mode,
        locale: opts.locale,
        next: opts.next,
        linkUserId: opts.linkUserId,
      },
      this.config.getOrThrow<string>('JWT_SECRET'),
    );
    return this.orcidOAuth.buildAuthorizeUrl(state);
  }

  async handleCallback(
    code: string,
    stateToken: string,
    meta: SessionMeta,
  ): Promise<OrcidCallbackResult> {
    if (!this.orcidOAuth.isEnabled()) {
      return { kind: 'error', code: 'ORCID_DISABLED', locale: 'en' };
    }
    const state = decodeOAuthState(
      stateToken,
      this.config.getOrThrow<string>('JWT_SECRET'),
    );
    if (!state) {
      return { kind: 'error', code: 'ORCID_STATE_INVALID', locale: 'en' };
    }
    try {
      const token = await this.orcidOAuth.exchangeCode(code);
      const person = await this.orcidOAuth.fetchPerson(
        token.accessToken,
        token.orcid,
      );
      if (state.mode === 'link') {
        if (!state.linkUserId) {
          return {
            kind: 'error',
            code: 'ORCID_STATE_INVALID',
            locale: state.locale,
          };
        }
        await this.linkOrcidToUser(state.linkUserId, person);
        return { kind: 'linked', locale: state.locale };
      }
      const resolved = await this.resolveLoginUser(person);
      const session = await this.authService.issueSessionForUser(
        resolved.userId,
        meta,
      );
      return {
        kind: 'session',
        session,
        userId: resolved.userId,
        locale: state.locale,
        next: state.next,
        needsProfileCompletion: resolved.needsProfileCompletion,
      };
    } catch (err) {
      if (err instanceof ConflictException) {
        const body = err.getResponse() as { code?: string };
        if (body.code === 'ORCID_EMAIL_EXISTS') {
          return {
            kind: 'error',
            code: 'ORCID_EMAIL_EXISTS',
            locale: state.locale,
          };
        }
        if (body.code === 'ORCID_ALREADY_LINKED') {
          return {
            kind: 'error',
            code: 'ORCID_ALREADY_LINKED',
            locale: state.locale,
          };
        }
      }
      throw err;
    }
  }

  async linkOrcidToUser(
    userId: string,
    person: OrcidPersonProfile,
  ): Promise<void> {
    await this.assertOrcidAvailable(person.orcid, userId);
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException({
        message: 'User not found',
        code: 'UNAUTHORIZED',
      });
    }
    if (user.orcid && user.orcid !== person.orcid) {
      throw new ConflictException({
        message: 'Your account is already linked to a different ORCID iD',
        code: 'ORCID_ALREADY_LINKED',
      });
    }
    await this.upsertOAuthIdentity(userId, person);
    await this.usersService.patchResearcherProfile(userId, {
      orcid: person.orcid,
      affiliation: person.affiliation ?? user.affiliation,
    });
    if (
      person.emailVerified &&
      person.email &&
      !this.usersService.isEmailVerified(user)
    ) {
      if (user.email.toLowerCase() === person.email) {
        await this.usersService.markEmailVerified(userId);
      }
    }
  }

  async unlinkOrcid(userId: string): Promise<void> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException({
        message: 'User not found',
        code: 'UNAUTHORIZED',
      });
    }
    if (!user.passwordHash) {
      throw new BadRequestException({
        message: 'Set a password before unlinking ORCID',
        code: 'VALIDATION_ERROR',
      });
    }
    await this.oauthRepo.delete({
      userId,
      provider: OAUTH_PROVIDER_ORCID,
    });
    await this.usersService.patchResearcherProfile(userId, { orcid: null });
  }

  private async resolveLoginUser(
    person: OrcidPersonProfile,
  ): Promise<{ userId: string; needsProfileCompletion: boolean }> {
    const existingOAuth = await this.oauthRepo.findOne({
      where: {
        provider: OAUTH_PROVIDER_ORCID,
        providerSubjectId: person.orcid,
      },
    });
    if (existingOAuth) {
      return {
        userId: existingOAuth.userId,
        needsProfileCompletion: await this.usersService.needsProfileCompletion(
          existingOAuth.userId,
        ),
      };
    }

    const byOrcid = await this.usersService.findByOrcid(person.orcid);
    if (byOrcid) {
      await this.upsertOAuthIdentity(byOrcid.id, person);
      return {
        userId: byOrcid.id,
        needsProfileCompletion: await this.usersService.needsProfileCompletion(
          byOrcid.id,
        ),
      };
    }

    if (person.email) {
      const byEmail = await this.usersService.findByEmail(person.email);
      if (byEmail) {
        throw new ConflictException({
          message:
            'An account with this email already exists. Sign in with your password, then link ORCID from your dashboard.',
          code: 'ORCID_EMAIL_EXISTS',
        });
      }
    }

    if (!person.email) {
      throw new BadRequestException({
        message:
          'ORCID did not provide a verified email. Add a public email to your ORCID record or register with email and password.',
        code: 'ORCID_EMAIL_REQUIRED',
      });
    }

    const user = await this.usersService.createOAuthUser({
      email: person.email,
      displayName: person.displayName,
      affiliation: person.affiliation,
      orcid: person.orcid,
      emailVerified: person.emailVerified,
    });
    await this.upsertOAuthIdentity(user.id, person);
    await this.authService.onOAuthUserCreated(user.id);
    return {
      userId: user.id,
      needsProfileCompletion: await this.usersService.needsProfileCompletion(
        user.id,
      ),
    };
  }

  private async upsertOAuthIdentity(
    userId: string,
    person: OrcidPersonProfile,
  ): Promise<void> {
    const existing = await this.oauthRepo.findOne({
      where: { userId, provider: OAUTH_PROVIDER_ORCID },
    });
    if (existing) {
      existing.providerSubjectId = person.orcid;
      existing.providerEmail = person.email;
      await this.oauthRepo.save(existing);
      return;
    }
    await this.oauthRepo.save(
      this.oauthRepo.create({
        userId,
        provider: OAUTH_PROVIDER_ORCID,
        providerSubjectId: person.orcid,
        providerEmail: person.email,
      }),
    );
  }

  private async assertOrcidAvailable(
    orcid: string,
    exceptUserId?: string,
  ): Promise<void> {
    const existingOAuth = await this.oauthRepo.findOne({
      where: {
        provider: OAUTH_PROVIDER_ORCID,
        providerSubjectId: orcid,
      },
    });
    if (existingOAuth && existingOAuth.userId !== exceptUserId) {
      throw new ConflictException({
        message: 'This ORCID iD is already linked to another account',
        code: 'ORCID_ALREADY_LINKED',
      });
    }
    const byOrcid = await this.usersService.findByOrcid(orcid);
    if (byOrcid && byOrcid.id !== exceptUserId) {
      throw new ConflictException({
        message: 'This ORCID iD is already linked to another account',
        code: 'ORCID_ALREADY_LINKED',
      });
    }
  }
}
