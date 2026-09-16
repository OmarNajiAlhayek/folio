import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EditorialBoardMember } from '../entities/editorial-board-member.entity';
import { Journal } from '../entities/journal.entity';
import { JournalIssue } from '../entities/journal-issue.entity';
import { JournalMembership } from '../entities/journal-membership.entity';
import { Submission } from '../entities/submission.entity';
import { EditorialBoardService } from './editorial-board.service';
import { JournalAdminController } from './journal-admin.controller';
import { JournalDirectoryService } from './journal-directory.service';
import { JournalIssuesService } from './journal-issues.service';
import { JournalMetadataService } from './journal-metadata.service';
import { JournalPortalService } from './journal-portal.service';
import { JournalMembershipService } from './journal-membership.service';

/**
 * Journal reference data and staff scoping. Imported by any module that needs
 * to ask which journals a user may act in, so the membership table has exactly
 * one owner.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Journal,
      JournalIssue,
      JournalMembership,
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
  ],
  exports: [
    JournalMembershipService,
    JournalIssuesService,
    JournalPortalService,
    JournalDirectoryService,
    EditorialBoardService,
  ],
})
export class JournalsModule {}
