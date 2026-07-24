import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Submission } from '../entities/submission.entity';
import { SubmissionFile } from '../entities/submission-file.entity';
import { ReviewAssignment } from '../entities/review-assignment.entity';
import { Review } from '../entities/review.entity';
import { ReviewDiscussion } from '../entities/review-discussion.entity';
import { ReviewDiscussionMessage } from '../entities/review-discussion-message.entity';
import { CopyeditAssignment } from '../entities/copyedit-assignment.entity';
import { CopyeditNote } from '../entities/copyedit-note.entity';
import { User } from '../entities/user.entity';
import { SectionEditorAssignment } from '../entities/section-editor-assignment.entity';
import { UserSectionEditorDiscipline } from '../entities/user-section-editor-discipline.entity';
import { SubmissionsService } from './submissions.service';
import { SubmissionAccessService } from './submission-access.service';
import { PublicationCatalogService } from './publication-catalog.service';
import { SubmissionFileService } from './submission-file.service';
import { SubmissionEventsService } from './submission-events.service';
import { ReviewWorkflowService } from './review-workflow.service';
import { ReviewDiscussionService } from './review-discussion.service';
import { CopyeditWorkflowService } from './copyedit-workflow.service';
import { SubmissionLifecycleService } from './submission-lifecycle.service';
import { SubmissionAiService } from './submission-ai.service';
import { ManuscriptAnalysisService } from './manuscript-analysis.service';
import { PreSubmitAnalysisService } from './pre-submit-analysis.service';
import { SubmissionsController } from './submissions.controller';
import { AssignmentsController } from './assignments.controller';
import { CopyeditAssignmentsController } from './copyedit-assignments.controller';
import { AssignmentRemindersController } from './assignment-reminders.controller';
import { DocxGeneratorService } from './docx-generator.service';
import { DocxImportService } from './docx-import.service';
import { EquationRenderService } from './equation-render.service';
import { EquationOmmlService } from './equation-omml.service';
import { ConstructorCollabGateway } from './constructor-collab.gateway';
import { LanguageToolService } from './language-tool.service';
import { RemindersService } from './reminders.service';
import { SectionEditorWorkflowService } from './section-editor-workflow.service';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RbacModule } from '../rbac/rbac.module';
import { MessagingModule } from '../messaging/messaging.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ManuscriptStylesModule } from '../manuscript-styles/manuscript-styles.module';
import { AiModule } from '../ai/ai.module';
import { AiJobsModule } from '../ai-jobs/ai-jobs.module';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    RbacModule,
    MessagingModule,
    NotificationsModule,
    ManuscriptStylesModule,
    AiModule,
    AiJobsModule,
    UsersModule,
    AuthModule,
    TypeOrmModule.forFeature([
      Submission,
      SubmissionFile,
      ReviewAssignment,
      Review,
      ReviewDiscussion,
      ReviewDiscussionMessage,
      CopyeditAssignment,
      CopyeditNote,
      User,
      SectionEditorAssignment,
      UserSectionEditorDiscipline,
    ]),
  ],
  controllers: [
    SubmissionsController,
    AssignmentsController,
    CopyeditAssignmentsController,
    AssignmentRemindersController,
  ],
  providers: [
    SubmissionAccessService,
    PublicationCatalogService,
    SubmissionFileService,
    SubmissionEventsService,
    ReviewWorkflowService,
    ReviewDiscussionService,
    CopyeditWorkflowService,
    SubmissionLifecycleService,
    SubmissionAiService,
    ManuscriptAnalysisService,
    PreSubmitAnalysisService,
    SubmissionsService,
    RemindersService,
    DocxGeneratorService,
    DocxImportService,
    EquationRenderService,
    EquationOmmlService,
    ConstructorCollabGateway,
    LanguageToolService,
    SectionEditorWorkflowService,
    PermissionsGuard,
  ],
  exports: [
    SubmissionsService,
    PublicationCatalogService,
    SubmissionFileService,
    SubmissionAccessService,
    ReviewWorkflowService,
    CopyeditWorkflowService,
    SectionEditorWorkflowService,
  ],
})
export class SubmissionsModule {}
