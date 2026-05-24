import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CopyeditAssignment } from './copyedit-assignment.entity';

@Entity('copyedit_notes')
export class CopyeditNote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'assignment_id' })
  assignmentId: string;

  @ManyToOne(() => CopyeditAssignment, (a) => a.notes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'assignment_id' })
  assignment: CopyeditAssignment;

  @Column({ type: 'int' })
  round: number;

  @Column({ name: 'note_for_author', type: 'text', default: '' })
  noteForAuthor: string;

  @Column({ name: 'note_to_editor_only', type: 'text', default: '' })
  noteToEditorOnly: string;

  @Column({ name: 'submitted_at', type: 'timestamptz' })
  submittedAt: Date;
}
