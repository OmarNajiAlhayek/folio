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
import { User } from './user.entity';
import { Submission } from './submission.entity';

/**
 * One row per section editor on one submission. Created at submit from the
 * section's standing links, or from the single editor-in-chief / journal
 * manager when the section has none. `canRecordDecision` is a snapshot.
 */
@Entity('section_editor_assignments')
@Unique('uq_sea_submission_editor', ['submissionId', 'sectionEditorId'])
@Index('ix_se_assignments_editor', ['sectionEditorId', 'assignedAt'])
export class SectionEditorAssignment extends BaseEntity {
  @Column({ name: 'submission_id' })
  submissionId: string;

  @ManyToOne(() => Submission, (s) => s.sectionEditorAssignments, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'submission_id' })
  submission: Submission;

  @Column({ name: 'section_editor_id' })
  sectionEditorId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'section_editor_id' })
  sectionEditor: User;

  @Column({ name: 'assigned_by_id' })
  assignedById: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'assigned_by_id' })
  assignedBy: User;

  /** Snapshot of the section link. Chief and manager rows are stored true and ignored: they record by role. */
  @Column({ name: 'can_record_decision', default: false })
  canRecordDecision: boolean;

  /** Free-text recommendation. Never changes submission status. */
  @Column({ type: 'text', nullable: true })
  recommendation: string | null;

  @CreateDateColumn({ name: 'assigned_at', type: 'timestamptz' })
  assignedAt: Date;
}
