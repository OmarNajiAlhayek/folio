import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  UpdateDateColumn,
} from 'typeorm';
import { BaseEntity } from '../common/base.entity';

export type AiJobType = 'similarity_index' | 'corpus_similarity';

export type AiJobStatus =
  | 'pending'
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed';

@Entity('ai_jobs')
@Index('ix_ai_jobs_submission_status', ['submissionId', 'status'])
@Index('ix_ai_jobs_slug_type_status', ['submissionSlug', 'jobType', 'status'])
export class AiJob extends BaseEntity {
  @Column({ name: 'job_type', type: 'varchar', length: 32 })
  jobType: AiJobType;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status: AiJobStatus;

  @Column({
    name: 'idempotency_key',
    type: 'varchar',
    length: 200,
    unique: true,
  })
  idempotencyKey: string;

  @Column({ name: 'submission_id', type: 'uuid', nullable: true })
  submissionId: string | null;

  @Column({
    name: 'submission_slug',
    type: 'varchar',
    length: 220,
    nullable: true,
  })
  submissionSlug: string | null;

  @Column({ name: 'requested_by_user_id', type: 'uuid', nullable: true })
  requestedByUserId: string | null;

  @Column({ type: 'jsonb', nullable: true })
  result: Record<string, unknown> | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ default: 0 })
  attempts: number;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
