import { MigrationInterface, QueryRunner } from 'typeorm';

export class Phase1DecisionAudit1782600000000 implements MigrationInterface {
  name = 'Phase1DecisionAudit1782600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "submissions"
        ADD COLUMN IF NOT EXISTS "last_decision_kind" VARCHAR(30),
        ADD COLUMN IF NOT EXISTS "author_response_to_reviewers" TEXT
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "submissions"
        DROP COLUMN IF EXISTS "author_response_to_reviewers",
        DROP COLUMN IF EXISTS "last_decision_kind"
    `);
  }
}
