import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Submission } from '../entities/submission.entity';
import { SubmissionFile } from '../entities/submission-file.entity';
import { ReviewAssignment } from '../entities/review-assignment.entity';
import { Review } from '../entities/review.entity';
import { CopyeditAssignment } from '../entities/copyedit-assignment.entity';
import { CopyeditNote } from '../entities/copyedit-note.entity';
import { User } from '../entities/user.entity';
import { SubmissionsService } from './submissions.service';
import { SubmissionsController } from './submissions.controller';
import { AssignmentsController } from './assignments.controller';
import { CopyeditAssignmentsController } from './copyedit-assignments.controller';
import { AssignmentRemindersController } from './assignment-reminders.controller';
import { DocxGeneratorService } from './docx-generator.service';
import { DocxImportService } from './docx-import.service';
import { EquationRenderService } from './equation-render.service';
import { RemindersService } from './reminders.service';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RbacModule } from '../rbac/rbac.module';
import { MessagingModule } from '../messaging/messaging.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ManuscriptStylesModule } from '../manuscript-styles/manuscript-styles.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [
    RbacModule,
    MessagingModule,
    NotificationsModule,
    ManuscriptStylesModule,
    AiModule,
    TypeOrmModule.forFeature([
      Submission,
      SubmissionFile,
      ReviewAssignment,
      Review,
      CopyeditAssignment,
      CopyeditNote,
      User,
    ]),
  ],
  controllers: [
    SubmissionsController,
    AssignmentsController,
    CopyeditAssignmentsController,
    AssignmentRemindersController,
  ],
  providers: [
    SubmissionsService,
    RemindersService,
    DocxGeneratorService,
    DocxImportService,
    EquationRenderService,
    PermissionsGuard,
  ],
  exports: [SubmissionsService],
})
export class SubmissionsModule {}
