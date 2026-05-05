import {
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { RequestUser } from '../common/types/request-user';
import { UsersService } from './users.service';

@ApiTags('role-invitations')
@Controller('role-invitations')
@UseGuards(AuthGuard('jwt'))
@ApiBearerAuth('JWT')
export class RoleInvitationsController {
  constructor(private readonly usersService: UsersService) {}

  @Post(':id/accept')
  accept(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.usersService.acceptRoleInvitation(user.sub, id);
  }

  @Post(':id/decline')
  decline(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.usersService.declineRoleInvitation(user.sub, id);
  }
}
