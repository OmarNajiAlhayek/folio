import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Exact-overlap (plagiarism) corpus for ai-service.
 *
 * Separate from `article_chunk_embeddings` on purpose: that table is FK-bound to
 * `submissions`, so it can only ever hold Folio's own published articles. The
 * plagiarism corpus must also hold the university back catalogue, external
 * open-access documents, and cached web pages — none of which are submissions.
 *
 * - `normalized_text` is NULL for sources we may not retain (external / web).
 *   Those are stored as one-way fingerprints plus a URL, which redistributes
 *   nothing and keeps the table small.
 * - `corpus_fingerprints` is the winnowed k-gram index: lookup is a btree probe
 *   per query hash, so corpus growth costs log time rather than a scan.
 * - `corpus_common_hashes` is the boilerplate stoplist (journal template text,
 *   stock methods sentences), rebuilt by ai-service after each bulk import.
 *
 * Fingerprints are only comparable within one parameter set (k, window, hash).
 * Changing those in ai-service requires re-running the importers.
 */
export class AddExactMatchCorpus1782700000000 implements MigrationInterface {
  name = 'AddExactMatchCorpus1782700000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "corpus_documents" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "source_kind" character varying(32) NOT NULL,
        "source_ref" character varying(512) NOT NULL,
        "submission_id" uuid,
        "title" text NOT NULL DEFAULT '',
        "authors" text NOT NULL DEFAULT '',
        "language" character varying(16) NOT NULL DEFAULT '',
        "category" character varying(120) NOT NULL DEFAULT '',
        "published_year" integer,
        "source_url" text NOT NULL DEFAULT '',
        "license" character varying(64) NOT NULL DEFAULT '',
        "token_count" integer NOT NULL DEFAULT 0,
        "normalized_text" text,
        "content_hash" character varying(64) NOT NULL DEFAULT '',
        "indexed_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_corpus_documents" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_corpus_documents_source" UNIQUE ("source_kind", "source_ref"),
        CONSTRAINT "CHK_corpus_documents_source_kind" CHECK (
          "source_kind" IN ('folio_submission', 'back_catalog', 'external_oa', 'web')
        ),
        CONSTRAINT "FK_corpus_documents_submission"
          FOREIGN KEY ("submission_id") REFERENCES "submissions"("id")
          ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "corpus_fingerprints" (
        "doc_id" uuid NOT NULL,
        "hash" bigint NOT NULL,
        "word_pos" integer NOT NULL,
        CONSTRAINT "PK_corpus_fingerprints" PRIMARY KEY ("doc_id", "word_pos"),
        CONSTRAINT "FK_corpus_fingerprints_document"
          FOREIGN KEY ("doc_id") REFERENCES "corpus_documents"("id")
          ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "corpus_common_hashes" (
        "hash" bigint NOT NULL,
        "doc_freq" integer NOT NULL,
        CONSTRAINT "PK_corpus_common_hashes" PRIMARY KEY ("hash")
      )
    `);

    // The whole matcher rides on this index: one probe per submission fingerprint.
    await queryRunner.query(
      `CREATE INDEX "ix_corpus_fingerprints_hash" ON "corpus_fingerprints" ("hash")`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_corpus_documents_submission_id" ON "corpus_documents" ("submission_id") WHERE "submission_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_corpus_documents_source_kind" ON "corpus_documents" ("source_kind")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "ix_corpus_documents_source_kind"`);
    await queryRunner.query(`DROP INDEX "ix_corpus_documents_submission_id"`);
    await queryRunner.query(`DROP INDEX "ix_corpus_fingerprints_hash"`);
    await queryRunner.query(`DROP TABLE "corpus_common_hashes"`);
    await queryRunner.query(`DROP TABLE "corpus_fingerprints"`);
    await queryRunner.query(`DROP TABLE "corpus_documents"`);
  }
}
