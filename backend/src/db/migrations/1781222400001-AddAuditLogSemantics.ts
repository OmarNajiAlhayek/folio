import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAuditLogSemantics1781222400001 implements MigrationInterface {
  name = 'AddAuditLogSemantics1781222400001';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "audit_log"
        ADD COLUMN "action_type"   varchar(32)  NULL,
        ADD COLUMN "resource_type" varchar(32)  NULL,
        ADD COLUMN "resource_id"   varchar(512) NULL
    `);

    await queryRunner.query(
      `CREATE INDEX "ix_audit_log_action_occurred" ON "audit_log" ("action_type", "occurred_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_audit_log_resource" ON "audit_log" ("resource_type", "resource_id", "occurred_at")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "ix_audit_log_resource"`);
    await queryRunner.query(`DROP INDEX "ix_audit_log_action_occurred"`);
    await queryRunner.query(`
      ALTER TABLE "audit_log"
        DROP COLUMN "action_type",
        DROP COLUMN "resource_type",
        DROP COLUMN "resource_id"
    `);
  }
}
