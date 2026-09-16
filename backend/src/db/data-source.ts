import { config as loadEnv } from 'dotenv';
import { join } from 'path';
import { DataSource, DataSourceOptions } from 'typeorm';
import { AiJob } from '../entities/ai-job.entity';
import { AuditLog } from '../entities/audit-log.entity';
import { AuthChallenge } from '../entities/auth-challenge.entity';
import { CopyeditAssignment } from '../entities/copyedit-assignment.entity';
import { CopyeditNote } from '../entities/copyedit-note.entity';
import { EditorialBoardMember } from '../entities/editorial-board-member.entity';
import { Notification } from '../entities/notification.entity';
import { OAuthIdentity } from '../entities/oauth-identity.entity';
import { OutboundEvent } from '../entities/outbound-event.entity';
import { Permission } from '../entities/permission.entity';
import { RefreshSession } from '../entities/refresh-session.entity';
import { ReviewAssignment } from '../entities/review-assignment.entity';
import { ReviewDiscussion } from '../entities/review-discussion.entity';
import { ReviewDiscussionMessage } from '../entities/review-discussion-message.entity';
import { Review } from '../entities/review.entity';
import { SectionEditorAssignment } from '../entities/section-editor-assignment.entity';
import { JournalSetting } from '../entities/journal-settings.entity';
import { Journal } from '../entities/journal.entity';
import { JournalIssue } from '../entities/journal-issue.entity';
import { JournalMembership } from '../entities/journal-membership.entity';
import { RevokedToken } from '../entities/revoked-token.entity';
import { RoleInvitation } from '../entities/role-invitation.entity';
import { RolePermission } from '../entities/role-permission.entity';
import { Role } from '../entities/role.entity';
import { SubmissionFile } from '../entities/submission-file.entity';
import { Submission } from '../entities/submission.entity';
import { UserRole } from '../entities/user-role.entity';
import { User } from '../entities/user.entity';

loadEnv({ path: join(__dirname, '..', '..', '.env') });

/**
 * Backend TypeORM datasource for CLI migrations (`npm run migrate*`) and
 * optional bootstrap migration runs. Entity metadata matches `app.module.ts`.
 */
export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_DATABASE ?? 'folio_review',
  entities: [
    User,
    Role,
    Permission,
    UserRole,
    RolePermission,
    Submission,
    SubmissionFile,
    ReviewAssignment,
    ReviewDiscussion,
    ReviewDiscussionMessage,
    Review,
    SectionEditorAssignment,
    JournalSetting,
    Journal,
    JournalIssue,
    JournalMembership,
    EditorialBoardMember,
    CopyeditAssignment,
    CopyeditNote,
    RoleInvitation,
    Notification,
    OutboundEvent,
    RevokedToken,
    RefreshSession,
    AuthChallenge,
    OAuthIdentity,
    AiJob,
    AuditLog,
  ],
  migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
  migrationsTransactionMode: 'each',
  synchronize: false,
};

export const AppDataSource = new DataSource(dataSourceOptions);
