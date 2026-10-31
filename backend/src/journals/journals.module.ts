import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EditorialBoardMember } from '../entities/editorial-board-member.entity';
import { Journal } from '../entities/journal.entity';
import { JournalIssue } from '../entities/journal-issue.entity';
import { JournalMembership } from '../entities/journal-membership.entity';
import { JournalSection } from '../entities/journal-section.entity';
import { SectionEditorLink } from '../entities/section-editor.entity';
import { Submission } from '../entities/submission.entity';
import { RbacModule } from '../rbac/rbac.module';
import { EditorialBoardService } from './editorial-board.service';
import { JournalAdminController } from './journal-admin.controller';
import { JournalDirectoryService } from './journal-directory.service';
import { JournalIssuesService } from './journal-issues.service';
import { JournalMetadataService } from './journal-metadata.service';
import { JournalPortalService } from './journal-portal.service';
import { JournalMembershipService } from './journal-membership.service';
import { JournalSectionsService } from './journal-sections.service';

/**
 * Journal reference data and staff scoping. Imported by any module that needs
 * to ask which journals a user may act in, so the membership table has exactly
 * one owner.
 */
@Module({
  imports: [
    RbacModule,
    TypeOrmModule.forFeature([
      Journal,
      JournalIssue,
      JournalMembership,
      JournalSection,
      SectionEditorLink,
      EditorialBoardMember,
      Submission,
    ]),
  ],
  controllers: [JournalAdminController],
  providers: [
    JournalMembershipService,
    JournalIssuesService,
    JournalPortalService,
    JournalDirectoryService,
    JournalMetadataService,
    EditorialBoardService,
    JournalSectionsService,
  ],
  exports: [
    JournalMembershipService,
    JournalIssuesService,
    JournalPortalService,
    JournalDirectoryService,
    EditorialBoardService,
    JournalSectionsService,
  ],
})
export class JournalsModule {}
