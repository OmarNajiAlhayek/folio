import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * submission_files.created_at was TIMESTAMP (no TZ) while copyedit_notes.submitted_at
 * is TIMESTAMPTZ — comparisons in copyedit revision checks were wrong off UTC.
 */
export class SubmissionFilesCreatedAtTimestamptz1781800000000 implements MigrationInterface {
  name = 'SubmissionFilesCreatedAtTimestamptz1781800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "submission_files"
       ALTER COLUMN "created_at" TYPE TIMESTAMP WITH TIME ZONE
       USING "created_at" AT TIME ZONE 'UTC'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "submission_files"
       ALTER COLUMN "created_at" TYPE TIMESTAMP
       USING "created_at" AT TIME ZONE 'UTC'`,
    );
  }
}
