import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDocxManuscriptViolations1782100000000 implements MigrationInterface {
  name = 'AddDocxManuscriptViolations1782100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "submissions" ADD COLUMN "docx_manuscript_violations" jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "submissions" DROP COLUMN "docx_manuscript_violations"`,
    );
  }
}
