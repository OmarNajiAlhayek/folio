import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OutboundEvent } from '../entities/outbound-event.entity';
import { MessagingModule } from '../messaging/messaging.module';
import { AdminEmailController } from './admin-email.controller';
import { AdminEmailService } from './admin-email.service';
import { EmailPipelineObservabilityService } from './email-pipeline-observability.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([OutboundEvent]),
    MessagingModule,
  ],
  controllers: [AdminEmailController],
  providers: [AdminEmailService, EmailPipelineObservabilityService],
  exports: [AdminEmailService],
})
export class AdminEmailModule {}
