import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
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
import { UsersService } from '../users/users.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { RequestUser } from '../common/types/request-user';
import {
  clearAuthCookies,
  FOLIO_CSRF_COOKIE,
  generateCsrfToken,
  setAuthCookies,
  setCsrfCookie,
} from './auth-cookie.util';
import { buildAuthResponseBody } from './auth-response.util';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
    private readonly config: ConfigService,
  ) {}

  @Post('register')
  @Throttle({ register: {} })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, user } = await this.authService.register(dto);
    const csrf = generateCsrfToken();
    setAuthCookies(res, this.config, accessToken, csrf);
    return buildAuthResponseBody(this.config, user, accessToken, csrf);
  }

  @Post('login')
  @Throttle({ login: {} })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, user } = await this.authService.login(
      dto.email,
      dto.password,
    );
    const csrf = generateCsrfToken();
    setAuthCookies(res, this.config, accessToken, csrf);
    return buildAuthResponseBody(this.config, user, accessToken, csrf);
  }

  @Post('logout')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.authService.revokeSessionFromRequest(req);
    clearAuthCookies(res, this.config);
    return { ok: true };
  }

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth('JWT')
  async me(
    @CurrentUser() jwtUser: RequestUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    let csrf = req.cookies?.[FOLIO_CSRF_COOKIE];
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
}
