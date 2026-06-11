import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { PatchMeDto } from './dto/patch-me.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { PatchResearcherProfileDto } from './dto/patch-researcher-profile.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { UsersService } from '../users/users.service';
import { OrcidAuthService } from './orcid-auth.service';
import {
  completeProfilePageUrl,
  dashboardPageUrl,
  orcidAuthErrorPageUrl,
} from '../common/folio-frontend-urls';
import { jwtFromCookieOrBearer } from './jwt-from-request.util';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { RequestUser } from '../common/types/request-user';
import {
  clearAuthCookies,
  generateCsrfToken,
  readCsrfFromRequest,
  setAuthCookies,
  setCsrfCookie,
} from './auth-cookie.util';
import { buildAuthResponseBody } from './auth-response.util';

function sessionMeta(req: Request) {
  return {
    userAgent: req.headers['user-agent'],
    ip: req.ip,
  };
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly orcidAuth: OrcidAuthService,
    private readonly usersService: UsersService,
    private readonly config: ConfigService,
  ) {}

  private appBaseUrl(): string {
    return (
      this.config.get<string>('APP_BASE_URL') ?? 'http://localhost:5240'
    ).replace(/\/+$/, '');
  }

  @Post('register')
  @Throttle({ register: {} })
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { session, user } = await this.authService.register(
      dto,
      sessionMeta(req),
    );
    const csrf = generateCsrfToken();
    setAuthCookies(
      res,
      this.config,
      session.accessToken,
      session.refreshToken,
      csrf,
    );
    return buildAuthResponseBody(
      this.config,
      user,
      session.accessToken,
      session.refreshToken,
      csrf,
    );
  }

  @Post('login')
  @HttpCode(200)
  @Throttle({ login: {} })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { session, user } = await this.authService.login(
      dto.email,
      dto.password,
      sessionMeta(req),
    );
    const csrf = generateCsrfToken();
    setAuthCookies(
      res,
      this.config,
      session.accessToken,
      session.refreshToken,
      csrf,
    );
    return buildAuthResponseBody(
      this.config,
      user,
      session.accessToken,
      session.refreshToken,
      csrf,
    );
  }

  @Post('refresh')
  @Throttle({ refresh: {} })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.authService.refreshFromRequest(
      req,
      sessionMeta(req),
    );
    let csrf = readCsrfFromRequest(req).cookie;
    if (!csrf) {
      csrf = generateCsrfToken();
    }
    setAuthCookies(
      res,
      this.config,
      session.accessToken,
      session.refreshToken,
      csrf,
    );
    return buildAuthResponseBody(
      this.config,
      undefined,
      session.accessToken,
      session.refreshToken,
      csrf,
    );
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.authService.revokeSessionFromRequest(req);
    clearAuthCookies(res, this.config);
    return { ok: true };
  }

  @Get('sessions')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT')
  listSessions(@CurrentUser() jwtUser: RequestUser, @Req() req: Request) {
    return this.authService.listSessions(jwtUser.sub, req);
  }

  @Delete('sessions/:id')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT')
  async revokeSession(
    @CurrentUser() jwtUser: RequestUser,
    @Param('id') id: string,
  ) {
    await this.authService.revokeSession(jwtUser.sub, id);
    return { ok: true };
  }

  @Post('sessions/revoke-others')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT')
  async revokeOtherSessions(
    @CurrentUser() jwtUser: RequestUser,
    @Req() req: Request,
  ) {
    const revoked = await this.authService.revokeOtherSessions(
      jwtUser.sub,
      req,
    );
    return { ok: true, revoked };
  }

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT')
  async me(
    @CurrentUser() jwtUser: RequestUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    let csrf = readCsrfFromRequest(req).cookie;
    if (!csrf) {
      csrf = generateCsrfToken();
      setCsrfCookie(res, this.config, csrf);
    }
    const profile = await this.usersService.toPublicProfile(jwtUser.sub);
    return { ...profile, csrfToken: csrf };
  }

  @Patch('me')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT')
  patchMe(@CurrentUser() jwtUser: RequestUser, @Body() dto: PatchMeDto) {
    return this.usersService.patchMe(jwtUser.sub, dto.preferredLocale);
  }

  @Post('verify-email/send')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT')
  @Throttle({ authOtp: {} })
  sendVerificationEmail(@CurrentUser() jwtUser: RequestUser) {
    return this.authService.sendVerificationEmail(jwtUser.sub);
  }

  @Post('verify-email')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT')
  @Throttle({ authOtp: {} })
  verifyEmail(
    @CurrentUser() jwtUser: RequestUser,
    @Body() dto: VerifyEmailDto,
  ) {
    return this.authService.verifyEmail(jwtUser.sub, dto.code);
  }

  @Post('forgot-password')
  @Throttle({ authPasswordReset: {} })
  @HttpCode(200)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Get('reset-password/validate')
  @Throttle({ public: {} })
  validateResetToken(@Query('token') token: string) {
    return this.authService.validateResetToken(token ?? '');
  }

  @Post('reset-password')
  @Throttle({ authPasswordReset: {} })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.password);
  }

  @Get('orcid')
  @Throttle({ public: {} })
  startOrcid(
    @Query('mode') mode: string | undefined,
    @Query('locale') locale: string | undefined,
    @Query('next') next: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const flowMode = mode === 'link' ? 'link' : 'login';
    const uiLocale = locale === 'ar' ? 'ar' : 'en';
    let linkUserId: string | undefined;
    if (flowMode === 'link') {
      const token = jwtFromCookieOrBearer(req);
      if (!token) {
        throw new UnauthorizedException({
          message: 'Sign in to link ORCID',
          code: 'UNAUTHORIZED',
        });
      }
      try {
        const payload = this.authService.verifyAccessToken(token);
        linkUserId = payload.sub;
      } catch {
        throw new UnauthorizedException({
          message: 'Sign in to link ORCID',
          code: 'UNAUTHORIZED',
        });
      }
    }
    const url = this.orcidAuth.startUrl({
      mode: flowMode,
      locale: uiLocale,
      next: next?.trim() || undefined,
      linkUserId,
    });
    return res.redirect(url);
  }

  @Get('orcid/callback')
  @Throttle({ public: {} })
  async orcidCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') oauthError: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const base = this.appBaseUrl();
    if (oauthError || !code || !state) {
      return res.redirect(
        orcidAuthErrorPageUrl(base, 'en', 'ORCID_STATE_INVALID'),
      );
    }
    const result = await this.orcidAuth.handleCallback(
      code,
      state,
      sessionMeta(req),
    );
    if (result.kind === 'error') {
      return res.redirect(
        orcidAuthErrorPageUrl(base, result.locale, result.code),
      );
    }
    if (result.kind === 'linked') {
      return res.redirect(
        `${dashboardPageUrl(base, result.locale)}?orcid=linked`,
      );
    }
    const csrf = generateCsrfToken();
    setAuthCookies(
      res,
      this.config,
      result.session.accessToken,
      result.session.refreshToken,
      csrf,
    );
    if (result.needsProfileCompletion) {
      return res.redirect(completeProfilePageUrl(base, result.locale));
    }
    const next = result.next?.startsWith('/') ? result.next : undefined;
    if (next) {
      return res.redirect(`${base}${next}`);
    }
    return res.redirect(dashboardPageUrl(base, result.locale));
  }

  @Post('orcid/unlink')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT')
  async unlinkOrcid(@CurrentUser() jwtUser: RequestUser) {
    await this.orcidAuth.unlinkOrcid(jwtUser.sub);
    return { ok: true };
  }

  @Patch('me/researcher-profile')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT')
  patchResearcherProfile(
    @CurrentUser() jwtUser: RequestUser,
    @Body() dto: PatchResearcherProfileDto,
  ) {
    return this.usersService.patchMyResearcherProfile(jwtUser.sub, dto);
  }

  @Post('me/password')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT')
  @Throttle({ authPasswordReset: {} })
  setPassword(
    @CurrentUser() jwtUser: RequestUser,
    @Body() dto: SetPasswordDto,
  ) {
    return this.authService.setPassword(jwtUser.sub, dto.password);
  }
}
