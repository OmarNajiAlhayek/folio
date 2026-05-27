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
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Permissions } from '../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { PERMISSION_SLUGS } from '../rbac/permission-slugs';
import { AdminEmailService } from './admin-email.service';
import { EmailPipelineObservabilityService } from './email-pipeline-observability.service';
import { OutboxRepairService } from '../messaging/outbox-repair.service';
import { DlqReplayService } from '../messaging/dlq-replay.service';
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
  constructor(
    private readonly adminEmail: AdminEmailService,
    private readonly pipelineObservability: EmailPipelineObservabilityService,
    private readonly outboxRepair: OutboxRepairService,
    private readonly dlqReplay: DlqReplayService,
  ) {}

  @Get('pipeline-status')
  @ApiOperation({
    summary: 'Email pipeline observability (outbox, email_log, reminders, RabbitMQ)',
  })
  @Permissions(PERMISSION_SLUGS.EMAIL_MANAGE_REMINDERS)
  getPipelineStatus() {
    return this.pipelineObservability.getPipelineStatus();
  }

  @Post('outbox/:id/requeue')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Requeue a dead outbox row (resets attempts; drainer publishes when broker is healthy)',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @Permissions(PERMISSION_SLUGS.EMAIL_MANAGE_REMINDERS)
  requeueDeadOutbox(@Param('id', ParseUUIDPipe) id: string) {
    return this.outboxRepair.requeueDead(id);
  }

  @Post('dlq/replay')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Replay up to N messages from the RabbitMQ DLQ back onto folio.events',
  })
  @Permissions(PERMISSION_SLUGS.EMAIL_MANAGE_REMINDERS)
  replayDlq(@Body() body?: { limit?: number }) {
    return this.dlqReplay.replayBatch(body?.limit);
  }

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
  getTemplate(
    @Param('templateKey') templateKey: string,
    @Query('locale') locale?: string,
  ) {
    return this.adminEmail.getTemplate(templateKey, locale);
  }

  @Patch('templates/:templateKey')
  @Permissions(PERMISSION_SLUGS.EMAIL_MANAGE_REMINDERS)
  @ApiParam({ name: 'templateKey', example: 'reviewer-invited' })
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
  @Permissions(PERMISSION_SLUGS.EMAIL_MANAGE_REMINDERS)
  @ApiParam({ name: 'templateKey', example: 'reminder-due' })
  previewTemplate(
    @Param('templateKey') templateKey: string,
    @Body() dto: PreviewEmailTemplateDto,
    @Query('locale') locale?: string,
  ) {
    return this.adminEmail.previewTemplate(
      templateKey,
      dto?.isOverdue,
      locale,
    );
  }
}
