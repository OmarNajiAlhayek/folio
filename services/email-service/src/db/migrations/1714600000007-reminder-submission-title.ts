import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Store manuscript title on reminder rows so reminder-due emails can render
 * {{submissionTitle}} without calling the backend at send time.
 */
export class ReminderSubmissionTitle1714600000007 implements MigrationInterface {
  name = 'ReminderSubmissionTitle1714600000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "email"."reminder"
        ADD COLUMN IF NOT EXISTS "submission_title" varchar(500) NOT NULL DEFAULT ''
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "email"."reminder"
        DROP COLUMN IF EXISTS "submission_title"
    `);
  }
}
