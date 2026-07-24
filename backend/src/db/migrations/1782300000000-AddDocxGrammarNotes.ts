import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDocxGrammarNotes1782300000000 implements MigrationInterface {
  name = 'AddDocxGrammarNotes1782300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "submissions" ADD COLUMN "docx_grammar_notes" jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "submissions" DROP COLUMN "docx_grammar_notes"`,
    );
  }
}
