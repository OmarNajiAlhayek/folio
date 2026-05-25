import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

@Entity('revoked_tokens')
@Index('ix_revoked_tokens_expires_at', ['expiresAt'])
export class RevokedToken {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  jti: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @CreateDateColumn({ name: 'revoked_at', type: 'timestamptz' })
  revokedAt: Date;
}
