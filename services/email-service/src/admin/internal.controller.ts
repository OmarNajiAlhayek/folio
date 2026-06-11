import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ServiceTokenGuard } from '../common/guards/service-token.guard';
import { AdminEmailService } from './admin-email.service';
import { PipelineObservabilityService } from './pipeline-observability.service';
import { ReminderAdminService } from './reminder-admin.service';
import {
  PatchEmailTemplateDto,
  PreviewEmailTemplateDto,
} from './dto/patch-email-template.dto';
import { PatchReminderPolicyDto } from './dto/patch-reminder-policy.dto';
import { PatchReminderDto } from './dto/patch-reminder.dto';

@Controller('internal')
@UseGuards(ServiceTokenGuard)
export class InternalController {
  constructor(
    private readonly adminEmail: AdminEmailService,
    private readonly pipeline: PipelineObservabilityService,
    private readonly reminders: ReminderAdminService,
  ) {}

  @Get('pipeline-status')
  getPipelineStatus() {
    return this.pipeline.getPipelineSlice();
  }

  @Get('reminder-policy')
  getReminderPolicy() {
    return this.adminEmail.getReminderPolicy();
  }

  @Patch('reminder-policy')
  patchReminderPolicy(@Body() dto: PatchReminderPolicyDto) {
    return this.adminEmail.patchReminderPolicy(
      dto.reviewDueInDays,
      dto.expectedUpdatedAt,
    );
  }

  @Get('templates/:templateKey')
  getTemplate(
    @Param('templateKey') templateKey: string,
    @Query('locale') locale?: string,
  ) {
    return this.adminEmail.getTemplate(templateKey, locale);
  }

  @Patch('templates/:templateKey')
  patchTemplate(
    @Param('templateKey') templateKey: string,
    @Body() dto: PatchEmailTemplateDto,
    @Query('locale') locale?: string,
  ) {
    return this.adminEmail.patchTemplate(
      templateKey,
      locale,
      dto.subjectTemplate,
      dto.htmlBody,
      dto.textBody,
      dto.expectedUpdatedAt,
    );
  }

  @Post('templates/:templateKey/preview')
  @HttpCode(HttpStatus.OK)
  previewTemplate(
    @Param('templateKey') templateKey: string,
    @Body() dto: PreviewEmailTemplateDto,
    @Query('locale') locale?: string,
  ) {
    return this.adminEmail.previewTemplate(templateKey, dto?.isOverdue, locale);
  }

  @Get('reminders')
  listReminders(@Query('assignmentSlug') assignmentSlug: string) {
    return this.reminders.listForAssignment(assignmentSlug);
  }

  @Get('reminders/:reminderId')
  getReminder(
    @Param('reminderId', ParseUUIDPipe) reminderId: string,
    @Query('assignmentSlug') assignmentSlug: string,
  ) {
    return this.reminders.getOne(reminderId, assignmentSlug);
  }

  @Patch('reminders/:reminderId')
  patchReminder(
    @Param('reminderId', ParseUUIDPipe) reminderId: string,
    @Query('assignmentSlug') assignmentSlug: string,
    @Body() dto: PatchReminderDto,
  ) {
    return this.reminders.patchSendAt(reminderId, assignmentSlug, dto.sendAt);
  }

  @Post('reminders/:reminderId/cancel')
  @HttpCode(HttpStatus.OK)
  cancelReminder(
    @Param('reminderId', ParseUUIDPipe) reminderId: string,
    @Query('assignmentSlug') assignmentSlug: string,
  ) {
    return this.reminders.cancel(reminderId, assignmentSlug);
  }
}
