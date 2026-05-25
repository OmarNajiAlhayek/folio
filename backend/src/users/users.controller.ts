import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AllowAuthenticated } from '../common/decorators/allow-authenticated.decorator';
import { Permissions } from '../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import type { RequestUser } from '../common/types/request-user';
import { PERMISSION_SLUGS } from '../rbac/permission-slugs';
import { CreateRoleInvitationDto } from './dto/create-role-invitation.dto';
import { UpdateUserRolesDto } from './dto/update-user-roles.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@Controller('users')
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@ApiBearerAuth('JWT')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me/role-invitations')
  @AllowAuthenticated()
  myRoleInvitations(@CurrentUser() user: RequestUser) {
    return this.usersService.listMyPendingRoleInvitations(user.sub);
  }

  @Get('reviewer-candidates')
  @Permissions(PERMISSION_SLUGS.SUBMISSION_ASSIGN_REVIEWER)
  reviewerCandidates() {
    return this.usersService.listReviewerCandidates();
  }

  @Get('copyeditor-candidates')
  @Permissions(PERMISSION_SLUGS.SUBMISSION_ASSIGN_COPYEDITOR)
  copyeditorCandidates() {
    return this.usersService.listCopyeditorCandidates();
  }

  @Post(':id/role-invitations')
  @Permissions(PERMISSION_SLUGS.USERS_MANAGE_ROLES)
  createRoleInvitation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateRoleInvitationDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.usersService.createRoleInvitation(
      user.sub,
      id,
      dto.roleSlug,
    );
  }

  @Patch(':id/roles')
  @Permissions(PERMISSION_SLUGS.USERS_MANAGE_ROLES)
  updateRoles(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserRolesDto,
    @CurrentUser() _actor: RequestUser,
  ) {
    return this.usersService.setRolesForUser(id, dto.roleSlugs);
  }
}
