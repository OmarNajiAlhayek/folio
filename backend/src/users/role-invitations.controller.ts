import {
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { RequestUser } from '../common/types/request-user';
import { AuthService } from '../auth/auth.service';
import { setAccessCookie } from '../auth/auth-cookie.util';
import { UsersService } from './users.service';
import { EmailVerifiedGuard } from './email-verified.guard';

@ApiTags('role-invitations')
@Controller('role-invitations')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth('JWT')
export class RoleInvitationsController {
  constructor(
    private readonly usersService: UsersService,
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Post(':id/accept')
  @UseGuards(EmailVerifiedGuard)
  async accept(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const profile = await this.usersService.acceptRoleInvitation(user.sub, id);
    const { accessToken } = await this.authService.reissueAccessForRequest(
      req,
      user.sub,
    );
    setAccessCookie(res, this.config, accessToken);
    return profile;
  }

  @Post(':id/decline')
  decline(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.usersService.declineRoleInvitation(user.sub, id);
  }
}
