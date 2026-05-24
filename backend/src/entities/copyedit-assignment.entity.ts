import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Submission } from './submission.entity';
import { CopyeditNote } from './copyedit-note.entity';

export enum CopyeditAssignmentStatus {
  ACTIVE = 'active',
  AWAITING_AUTHOR = 'awaiting_author',
  READY_FOR_REVIEW = 'ready_for_review',
}

@Entity('copyedit_assignments')
export class CopyeditAssignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 260, unique: true, nullable: true })
  slug: string | null;

  @Column({ name: 'submission_id' })
  submissionId: string;

  @ManyToOne(() => Submission, (s) => s.copyeditAssignments, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'submission_id' })
  submission: Submission;

  @Column({ name: 'copyeditor_id' })
  copyeditorId: string;

  @ManyToOne(() => User, (u) => u.copyeditAssignments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'copyeditor_id' })
  copyeditor: User;

  @Column({ type: 'varchar', length: 32, default: 'active' })
  status: CopyeditAssignmentStatus;

  @CreateDateColumn({ name: 'assigned_at' })
  assignedAt: Date;

  @OneToMany(() => CopyeditNote, (n) => n.assignment)
  notes: CopyeditNote[];
}
