import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
} from 'typeorm';
import { BaseEntity } from '../common/base.entity';
import { User } from './user.entity';
import { Submission } from './submission.entity';

@Entity('section_editor_assignments')
export class SectionEditorAssignment extends BaseEntity {
  @Column({ name: 'submission_id' })
  submissionId: string;

  @OneToOne(() => Submission, (s) => s.sectionEditorAssignment, {
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

  @CreateDateColumn({ name: 'assigned_at', type: 'timestamptz' })
  assignedAt: Date;
}
