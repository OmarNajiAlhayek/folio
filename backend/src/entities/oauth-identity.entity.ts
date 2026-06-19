import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  UpdateDateColumn,
} from 'typeorm';
import { BaseEntity } from '../common/base.entity';
import { User } from './user.entity';

export const OAUTH_PROVIDER_ORCID = 'orcid' as const;
export type OAuthProvider = typeof OAUTH_PROVIDER_ORCID;

@Entity('oauth_identities')
@Index(['provider', 'providerSubjectId'], { unique: true })
@Index(['userId', 'provider'], { unique: true })
export class OAuthIdentity extends BaseEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'varchar', length: 32 })
  provider: OAuthProvider;

  /** Provider-specific stable id (ORCID iD for ORCID). */
  @Column({ name: 'provider_subject_id', type: 'varchar', length: 64 })
  providerSubjectId: string;

  @Column({
    name: 'provider_email',
    type: 'varchar',
    length: 320,
    nullable: true,
  })
  providerEmail: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
