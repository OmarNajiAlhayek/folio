import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Journal } from '../entities/journal.entity';
import { JournalIssue } from '../entities/journal-issue.entity';
import { JournalMembership } from '../entities/journal-membership.entity';
import { Submission } from '../entities/submission.entity';
import { JournalIssuesService } from './journal-issues.service';
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
      Submission,
    ]),
  ],
  providers: [
    JournalMembershipService,
    JournalIssuesService,
    JournalPortalService,
  ],
  exports: [
    JournalMembershipService,
    JournalIssuesService,
    JournalPortalService,
  ],
})
export class JournalsModule {}
