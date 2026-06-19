import { MigrationInterface, QueryRunner } from 'typeorm';

export class MultiDisciplineSubmissions1781900000000 implements MigrationInterface {
  name = 'MultiDisciplineSubmissions1781900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "submissions" DROP COLUMN IF EXISTS "discipline"`,
    );
    await queryRunner.query(
      `ALTER TABLE "submissions" ADD COLUMN "disciplines" text array NOT NULL DEFAULT '{}'`,
    );
    await queryRunner.query(
      `ALTER TABLE "submissions" DROP COLUMN IF EXISTS "discipline_suggested"`,
    );
    await queryRunner.query(
      `ALTER TABLE "submissions" ADD COLUMN "discipline_suggested_labels" text array NOT NULL DEFAULT '{}'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "submissions" DROP COLUMN IF EXISTS "discipline_suggested_labels"`,
    );
    await queryRunner.query(
      `ALTER TABLE "submissions" ADD COLUMN "discipline_suggested" character varying(120)`,
    );
    await queryRunner.query(
      `ALTER TABLE "submissions" DROP COLUMN IF EXISTS "disciplines"`,
    );
    await queryRunner.query(
      `ALTER TABLE "submissions" ADD COLUMN "discipline" character varying(120)`,
    );
  }
}
