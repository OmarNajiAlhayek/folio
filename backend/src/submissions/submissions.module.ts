import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Submission } from '../entities/submission.entity';
import { SubmissionFile } from '../entities/submission-file.entity';
import { ReviewAssignment } from '../entities/review-assignment.entity';
import { Review } from '../entities/review.entity';
import { User } from '../entities/user.entity';
import { SubmissionsService } from './submissions.service';
import { SubmissionsController } from './submissions.controller';
import { AssignmentsController } from './assignments.controller';
import { AssignmentRemindersController } from './assignment-reminders.controller';
import { DocxGeneratorService } from './docx-generator.service';
import { RemindersService } from './reminders.service';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RbacModule } from '../rbac/rbac.module';
import { MessagingModule } from '../messaging/messaging.module';

@Module({
  imports: [
    RbacModule,
    MessagingModule,
    TypeOrmModule.forFeature([
      Submission,
      SubmissionFile,
      ReviewAssignment,
      Review,
      User,
    ]),
  ],
  controllers: [
    SubmissionsController,
    AssignmentsController,
    AssignmentRemindersController,
  ],
  providers: [SubmissionsService, RemindersService, DocxGeneratorService, PermissionsGuard],
  exports: [SubmissionsService],
})
export class SubmissionsModule {}
