import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropUuidPkDefaults1781500000000 implements MigrationInterface {
  name = 'DropUuidPkDefaults1781500000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "email"."email_log" ALTER COLUMN "id" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "email"."reminder" ALTER COLUMN "id" DROP DEFAULT`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "email"."email_log" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()`,
    );
    await queryRunner.query(
      `ALTER TABLE "email"."reminder" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()`,
    );
  }
}
