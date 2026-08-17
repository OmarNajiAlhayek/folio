import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Exact-match corpus: store original extracted text for quotable evidence.
 *
 * Matching still normalizes in memory (fingerprints, verify, content_hash).
 * The column formerly named `normalized_text` held space-joined folded tokens;
 * that made UI snippets show حمايه / على folds. `retained_text` holds the
 * original extract (NUL-scrubbed). NULL still means fingerprint-only
 * (external / web / quarantined).
 */
export class RenameCorpusNormalizedTextToRetained1782800000000 implements MigrationInterface {
  name = 'RenameCorpusNormalizedTextToRetained1782800000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "corpus_documents" RENAME COLUMN "normalized_text" TO "retained_text"`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "corpus_documents" RENAME COLUMN "retained_text" TO "normalized_text"`,
    );
  }
}
