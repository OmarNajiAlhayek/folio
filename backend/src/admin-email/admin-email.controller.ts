import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Permissions } from '../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { PERMISSION_SLUGS } from '../rbac/permission-slugs';
import { AdminEmailService } from './admin-email.service';
import {
  PatchEmailTemplateDto,
  PreviewEmailTemplateDto,
} from './dto/patch-email-template.dto';
import { PatchReminderPolicyDto } from './dto/patch-reminder-policy.dto';

@ApiTags('admin-email')
@Controller('admin/email')
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@ApiBearerAuth('JWT')
export class AdminEmailController {
  constructor(private readonly adminEmail: AdminEmailService) {}

  @Get('reminder-policy')
  @Permissions(PERMISSION_SLUGS.EMAIL_MANAGE_REMINDERS)
  getReminderPolicy() {
    return this.adminEmail.getReminderPolicy();
  }

  @Patch('reminder-policy')
  @Permissions(PERMISSION_SLUGS.EMAIL_MANAGE_REMINDERS)
  patchReminderPolicy(@Body() dto: PatchReminderPolicyDto) {
    return this.adminEmail.patchReminderPolicy(
      dto.reviewDueInDays,
      dto.expectedUpdatedAt,
    );
  }

  @Get('templates/:templateKey')
  @Permissions(PERMISSION_SLUGS.EMAIL_MANAGE_REMINDERS)
  @ApiParam({ name: 'templateKey', example: 'reviewer-invited' })
  getTemplate(@Param('templateKey') templateKey: string) {
    return this.adminEmail.getTemplate(templateKey);
  }

  @Patch('templates/:templateKey')
  @Permissions(PERMISSION_SLUGS.EMAIL_MANAGE_REMINDERS)
  @ApiParam({ name: 'templateKey', example: 'reviewer-invited' })
  patchTemplate(
    @Param('templateKey') templateKey: string,
    @Body() dto: PatchEmailTemplateDto,
  ) {
    return this.adminEmail.patchTemplate(
      templateKey,
      dto.subjectTemplate,
      dto.htmlBody,
      dto.textBody,
      dto.expectedUpdatedAt,
    );
  }

  @Post('templates/:templateKey/preview')
  @Permissions(PERMISSION_SLUGS.EMAIL_MANAGE_REMINDERS)
  @ApiParam({ name: 'templateKey', example: 'reminder-due' })
  previewTemplate(
    @Param('templateKey') templateKey: string,
    @Body() dto: PreviewEmailTemplateDto,
  ) {
    return this.adminEmail.previewTemplate(templateKey, dto?.isOverdue);
  }
}
