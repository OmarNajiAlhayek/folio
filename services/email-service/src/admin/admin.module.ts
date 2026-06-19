import { Module } from '@nestjs/common';
import { AdminEmailService } from './admin-email.service';
import { InternalController } from './internal.controller';
import { PipelineObservabilityService } from './pipeline-observability.service';
import { ReminderAdminService } from './reminder-admin.service';
import { ServiceTokenGuard } from '../common/guards/service-token.guard';
import { TemplatesModule } from '../templates/templates.module';

@Module({
  imports: [TemplatesModule],
  controllers: [InternalController],
  providers: [
    AdminEmailService,
    PipelineObservabilityService,
    ReminderAdminService,
    ServiceTokenGuard,
  ],
  exports: [
    AdminEmailService,
    PipelineObservabilityService,
    ReminderAdminService,
  ],
})
export class AdminModule {}
