import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './user.entity';

export enum RoleInvitationStatus {
  INVITED = 'invited',
  ACCEPTED = 'accepted',
  DECLINED = 'declined',
}

@Entity('role_invitations')
export class RoleInvitation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'invitee_user_id' })
  inviteeUserId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'invitee_user_id' })
  invitee: User;

  @Column({ name: 'invited_by_user_id' })
  invitedByUserId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'invited_by_user_id' })
  invitedBy: User;

  @Column({ type: 'varchar', length: 32 })
  roleSlug: string;

  @Column({
    type: 'varchar',
    length: 32,
    default: 'invited',
  })
  status: RoleInvitationStatus;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;
}
