import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Claim column for multi-instance reminder scheduler (FOR UPDATE SKIP LOCKED).
 */
export class ReminderPickedAt1714600000008 implements MigrationInterface {
  name = 'ReminderPickedAt1714600000008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "email"."reminder"
        ADD COLUMN IF NOT EXISTS "picked_at" timestamptz NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "ix_reminder_pending_pick"
        ON "email"."reminder" ("status", "send_at")
        WHERE "status" = 'pending'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "email"."ix_reminder_pending_pick"`);
    await queryRunner.query(`
      ALTER TABLE "email"."reminder"
        DROP COLUMN IF EXISTS "picked_at"
    `);
  }
}
