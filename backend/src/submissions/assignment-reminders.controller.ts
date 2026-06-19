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
import { RemindersService } from './reminders.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { RequestUser } from '../common/types/request-user';
import { Permissions } from '../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { ASSIGNMENT_REMINDER_PERMISSIONS } from '../rbac/permission-slugs';
import { PatchReminderDto } from './dto/patch-reminder.dto';

@ApiTags('reminders')
@Controller('submissions/:submissionSlug/assignments/:assignmentSlug')
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@ApiBearerAuth('JWT')
export class AssignmentRemindersController {
  constructor(private readonly reminders: RemindersService) {}

  @Get('reminders')
  @Permissions(...ASSIGNMENT_REMINDER_PERMISSIONS)
  list(
    @Param('submissionSlug') submissionSlug: string,
    @Param('assignmentSlug') assignmentSlug: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.reminders.listForAssignment(
      submissionSlug,
      assignmentSlug,
      user,
    );
  }

  @Get('reminders/:reminderId')
  @Permissions(...ASSIGNMENT_REMINDER_PERMISSIONS)
  getOne(
    @Param('submissionSlug') submissionSlug: string,
    @Param('assignmentSlug') assignmentSlug: string,
    @Param('reminderId', ParseUUIDPipe) reminderId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.reminders.getOne(
      submissionSlug,
      assignmentSlug,
      reminderId,
      user,
    );
  }

  @Patch('reminders/:reminderId')
  @Permissions(...ASSIGNMENT_REMINDER_PERMISSIONS)
  patch(
    @Param('submissionSlug') submissionSlug: string,
    @Param('assignmentSlug') assignmentSlug: string,
    @Param('reminderId', ParseUUIDPipe) reminderId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: PatchReminderDto,
  ) {
    return this.reminders.patchSendAt(
      submissionSlug,
      assignmentSlug,
      reminderId,
      user,
      dto.sendAt,
    );
  }

  @Post('reminders/:reminderId/cancel')
  @Permissions(...ASSIGNMENT_REMINDER_PERMISSIONS)
  cancel(
    @Param('submissionSlug') submissionSlug: string,
    @Param('assignmentSlug') assignmentSlug: string,
    @Param('reminderId', ParseUUIDPipe) reminderId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.reminders.cancel(
      submissionSlug,
      assignmentSlug,
      reminderId,
      user,
    );
  }
}
