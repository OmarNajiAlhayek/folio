import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEditorQueuePartialIndex1781700000000 implements MigrationInterface {
  name = 'AddEditorQueuePartialIndex1781700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "ix_submissions_editor_queue" ON "submissions" ("updated_at" DESC) WHERE "status" <> 'draft'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."ix_submissions_editor_queue"`,
    );
  }
}
