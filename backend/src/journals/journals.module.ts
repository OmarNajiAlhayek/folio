import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Journal } from '../entities/journal.entity';
import { JournalMembership } from '../entities/journal-membership.entity';
import { JournalMembershipService } from './journal-membership.service';

/**
 * Journal reference data and staff scoping. Imported by any module that needs
 * to ask which journals a user may act in, so the membership table has exactly
 * one owner.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Journal, JournalMembership])],
  providers: [JournalMembershipService],
  exports: [JournalMembershipService],
})
export class JournalsModule {}
