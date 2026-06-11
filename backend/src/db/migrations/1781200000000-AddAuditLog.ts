import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAuditLog1781200000000 implements MigrationInterface {
  name = 'AddAuditLog1781200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "audit_log" (
        "id"            uuid          NOT NULL DEFAULT uuid_generate_v4(),
        "user_id"       varchar       NULL,
        "user_email"    varchar(320)  NULL,
        "user_roles"    text[]        NULL,
        "method"        varchar(8)    NOT NULL,
        "route_pattern" varchar(512)  NULL,
        "path"          varchar(512)  NOT NULL,
        "status_code"   smallint      NULL,
        "ip_address"    varchar(64)   NULL,
        "user_agent"    varchar(512)  NULL,
        "request_body"  jsonb         NULL,
        "params"        jsonb         NULL,
        "duration_ms"   integer       NULL,
        "occurred_at"   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "error"         text          NULL,
        CONSTRAINT "PK_audit_log_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "ix_audit_log_user_occurred" ON "audit_log" ("user_id", "occurred_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_audit_log_occurred" ON "audit_log" ("occurred_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_audit_log_route_occurred" ON "audit_log" ("route_pattern", "occurred_at")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "ix_audit_log_route_occurred"`);
    await queryRunner.query(`DROP INDEX "ix_audit_log_occurred"`);
    await queryRunner.query(`DROP INDEX "ix_audit_log_user_occurred"`);
    await queryRunner.query(`DROP TABLE "audit_log"`);
  }
}
