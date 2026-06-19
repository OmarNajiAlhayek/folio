import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { BaseEntity } from '../common/base.entity';
import { Submission } from './submission.entity';
import { SubmissionFileStage } from './submission-file-stage.enum';

@Entity('submission_files')
export class SubmissionFile extends BaseEntity {
  @Column({ name: 'submission_id' })
  submissionId: string;

  @ManyToOne(() => Submission, (s) => s.files, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'submission_id' })
  submission: Submission;

  @Column({ name: 'storage_key' })
  storageKey: string;

  @Column({ name: 'original_name' })
  originalName: string;

  @Column({ name: 'mime_type' })
  mimeType: string;

  @Column({ name: 'size_bytes', type: 'bigint' })
  sizeBytes: string;

  @Column({ default: 'manuscript' })
  kind: string;

  @Column({
    name: 'file_stage',
    type: 'enum',
    enum: SubmissionFileStage,
    default: SubmissionFileStage.SUBMISSION,
  })
  fileStage: SubmissionFileStage;

  @Column({ name: 'is_public', default: false })
  isPublic: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
