import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPreSubmitAnalysis1782000000000 implements MigrationInterface {
  name = 'AddPreSubmitAnalysis1782000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "submissions" ADD COLUMN "pre_submit_analysis" jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "submissions" DROP COLUMN "pre_submit_analysis"`,
    );
  }
}
