import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Initial schema for the email-service. Creates the `email` schema
 * (idempotent) and the two tables described in plan §6.
 *
 * Stays separate from the backend's `public` schema so the two apps
 * never write to each other's tables.
 */
export class Init1714600000000 implements MigrationInterface {
  name = 'Init1714600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS "email"`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "email"."email_log" (
        "id"                    uuid          NOT NULL DEFAULT gen_random_uuid(),
        "idempotency_key"       varchar(200)  NOT NULL,
        "recipient"             varchar(320)  NOT NULL,
        "template"              varchar(64)   NOT NULL,
        "context"               jsonb         NOT NULL,
        "status"                varchar(16)   NOT NULL DEFAULT 'pending',
        "provider_message_id"   varchar(200),
        "error"                 text,
        "sent_at"               timestamptz,
        "created_at"            timestamptz   NOT NULL DEFAULT now(),
        CONSTRAINT "pk_email_log" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "ux_email_log_idempotency_key"
        ON "email"."email_log" ("idempotency_key")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "email"."reminder" (
        "id"                    uuid          NOT NULL DEFAULT gen_random_uuid(),
        "assignment_slug"       varchar(260)  NOT NULL,
        "reviewer_id"           varchar(64)   NOT NULL,
        "reviewer_email"        varchar(320)  NOT NULL,
        "reviewer_display_name" varchar(200)  NOT NULL,
        "kind"                  varchar(32)   NOT NULL,
        "send_at"               timestamptz   NOT NULL,
        "status"                varchar(16)   NOT NULL DEFAULT 'pending',
        "sent_at"               timestamptz,
        "created_at"            timestamptz   NOT NULL DEFAULT now(),
        CONSTRAINT "pk_reminder" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "ix_reminder_due"
        ON "email"."reminder" ("status", "send_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "email"."reminder"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "email"."email_log"`);
  }
}
