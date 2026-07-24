import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiJob } from '../entities/ai-job.entity';
import { Submission } from '../entities/submission.entity';
import { SubmissionFile } from '../entities/submission-file.entity';
import { MessagingModule } from '../messaging/messaging.module';
import { AiModule } from '../ai/ai.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AiJobsConsumerService } from './ai-jobs-consumer.service';
import { AiJobsProcessor } from './ai-jobs.processor';
import { AiJobsRabbitMqConnection } from './ai-jobs-rabbitmq.connection';
import { AiJobsService } from './ai-jobs.service';
import { AiJobsHealthController } from './ai-jobs-health.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([AiJob, Submission, SubmissionFile]),
    MessagingModule,
    AiModule,
    NotificationsModule,
  ],
  controllers: [AiJobsHealthController],
  providers: [
    AiJobsRabbitMqConnection,
    AiJobsService,
    AiJobsProcessor,
    AiJobsConsumerService,
  ],
  exports: [AiJobsService],
})
export class AiJobsModule {}
