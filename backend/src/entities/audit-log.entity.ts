import { Column, Entity, Index } from 'typeorm';
import type { AuditActionType, AuditResourceType } from '../audit/audit-action';
import { BaseEntity } from '../common/base.entity';

@Entity('audit_log')
@Index('ix_audit_log_user_occurred', ['userId', 'occurredAt'])
@Index('ix_audit_log_occurred', ['occurredAt'])
@Index('ix_audit_log_route_occurred', ['routePattern', 'occurredAt'])
@Index('ix_audit_log_action_occurred', ['actionType', 'occurredAt'])
@Index('ix_audit_log_resource', ['resourceType', 'resourceId', 'occurredAt'])
export class AuditLog extends BaseEntity {
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId: string | null;

  @Column({ name: 'user_email', type: 'varchar', length: 320, nullable: true })
  userEmail: string | null;

  @Column({ name: 'user_roles', type: 'text', array: true, nullable: true })
  userRoles: string[] | null;

  @Column({ type: 'varchar', length: 8 })
  method: string;

  @Column({
    name: 'route_pattern',
    type: 'varchar',
    length: 512,
    nullable: true,
  })
  routePattern: string | null;

  @Column({ type: 'varchar', length: 512 })
  path: string;

  @Column({ name: 'status_code', type: 'smallint', nullable: true })
  statusCode: number | null;

  @Column({ name: 'ip_address', type: 'varchar', length: 64, nullable: true })
  ipAddress: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 512, nullable: true })
  userAgent: string | null;

  @Column({ name: 'request_body', type: 'jsonb', nullable: true })
  requestBody: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  params: Record<string, unknown> | null;

  @Column({ name: 'duration_ms', type: 'int', nullable: true })
  durationMs: number | null;

  @Column({ name: 'occurred_at', type: 'timestamptz', default: () => 'now()' })
  occurredAt: Date;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @Column({ name: 'action_type', type: 'varchar', length: 32, nullable: true })
  actionType: AuditActionType | null;

  @Column({
    name: 'resource_type',
    type: 'varchar',
    length: 32,
    nullable: true,
  })
  resourceType: AuditResourceType | null;

  @Column({ name: 'resource_id', type: 'varchar', length: 512, nullable: true })
  resourceId: string | null;
}
