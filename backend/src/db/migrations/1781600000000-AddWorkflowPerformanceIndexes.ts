import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWorkflowPerformanceIndexes1781600000000 implements MigrationInterface {
  name = 'AddWorkflowPerformanceIndexes1781600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "ix_submissions_status_updated_at" ON "submissions" ("status", "updated_at" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_submissions_author_updated_at" ON "submissions" ("author_id", "updated_at" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_submissions_status_published_at" ON "submissions" ("status", "published_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_submissions_similarity_pending" ON "submissions" ("status", "similarity_indexed_at") WHERE "similarity_indexed_at" IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_review_assignments_reviewer_assigned" ON "review_assignments" ("reviewer_id", "assigned_at" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_review_assignments_submission_id" ON "review_assignments" ("submission_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."ix_review_assignments_submission_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."ix_review_assignments_reviewer_assigned"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."ix_submissions_similarity_pending"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."ix_submissions_status_published_at"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."ix_submissions_author_updated_at"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."ix_submissions_status_updated_at"`,
    );
  }
}
