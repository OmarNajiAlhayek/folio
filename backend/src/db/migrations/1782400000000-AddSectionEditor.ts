import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSectionEditor1782400000000 implements MigrationInterface {
  name = 'AddSectionEditor1782400000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "user_section_editor_disciplines" (
        "user_id"          uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "discipline_label" text NOT NULL,
        CONSTRAINT "PK_user_se_disciplines" PRIMARY KEY ("user_id", "discipline_label")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "ix_user_se_disciplines_discipline" ON "user_section_editor_disciplines" ("discipline_label")`,
    );

    await queryRunner.query(`
      CREATE TABLE "section_editor_assignments" (
        "id"                uuid         NOT NULL DEFAULT uuid_generate_v4(),
        "submission_id"     uuid         NOT NULL REFERENCES "submissions"("id") ON DELETE CASCADE,
        "section_editor_id" uuid         NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "assigned_by_id"    uuid         NOT NULL REFERENCES "users"("id"),
        "assigned_at"       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_section_editor_assignments" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_sea_submission_id" UNIQUE ("submission_id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "ix_se_assignments_editor" ON "section_editor_assignments" ("section_editor_id", "assigned_at")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "ix_se_assignments_editor"`);
    await queryRunner.query(`DROP TABLE "section_editor_assignments"`);
    await queryRunner.query(`DROP INDEX "ix_user_se_disciplines_discipline"`);
    await queryRunner.query(`DROP TABLE "user_section_editor_disciplines"`);
  }
}
