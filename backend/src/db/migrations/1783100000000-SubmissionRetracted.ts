import { MigrationInterface, QueryRunner } from 'typeorm';

export class SubmissionRetracted1783100000000 implements MigrationInterface {
  name = 'SubmissionRetracted1783100000000';

  // ALTER TYPE ... ADD VALUE cannot run inside a PG transaction
  public transaction = false;

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."submissions_status_enum" ADD VALUE IF NOT EXISTS 'retracted'`,
    );
  }

  async down(): Promise<void> {
    // PostgreSQL cannot drop a single enum value.
  }
}
