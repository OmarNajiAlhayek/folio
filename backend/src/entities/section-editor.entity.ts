import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  Unique,
} from 'typeorm';
import { BaseEntity } from '../common/base.entity';
import { JournalSection } from './journal-section.entity';
import { User } from './user.entity';

/**
 * Standing link from a section editor to one section. Unique on
 * (section, user). One person may be linked to several sections of the
 * same journal. `canRecordDecision` is copied onto each submission
 * assignment at submit time; later edits here do not rewrite open papers.
 */
@Entity('section_editors')
@Unique('uq_section_editors_section_user', ['sectionId', 'userId'])
@Index('ix_section_editors_user', ['userId'])
export class SectionEditorLink extends BaseEntity {
  @Column({ name: 'section_id', type: 'uuid' })
  sectionId: string;

  @ManyToOne(() => JournalSection, (section) => section.editors, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'section_id' })
  section: JournalSection;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'can_record_decision', default: false })
  canRecordDecision: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
