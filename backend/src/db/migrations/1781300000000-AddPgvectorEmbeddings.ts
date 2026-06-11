import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Vector embeddings for ai-service similarity features.
 *
 * - Uses vector_cosine_ops (true cosine distance on unnormalized vectors from
 *   paraphrase-multilingual-mpnet-base-v2). Do not switch to vector_ip_ops
 *   without L2-normalizing embeddings first.
 * - HNSW params: m=16, ef_construction=64 (pgvector defaults, stated explicitly).
 * - Query recall: ai-service sets hnsw.ef_search per connection (default 64).
 * - Requires superuser (or equivalent) for CREATE EXTENSION on managed Postgres.
 * - down() drops tables only; leaves the vector extension installed.
 */
export class AddPgvectorEmbeddings1781300000000 implements MigrationInterface {
  name = 'AddPgvectorEmbeddings1781300000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS vector`);

    await queryRunner.query(`
      CREATE TABLE "article_summary_embeddings" (
        "submission_id" uuid NOT NULL,
        "embedding" vector(768) NOT NULL,
        "summary_text" text NOT NULL,
        "abstract" text NOT NULL DEFAULT '',
        "keywords" text NOT NULL DEFAULT '',
        "category" varchar(120) NOT NULL DEFAULT '',
        "indexed_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_article_summary_embeddings" PRIMARY KEY ("submission_id"),
        CONSTRAINT "FK_article_summary_embeddings_submission"
          FOREIGN KEY ("submission_id") REFERENCES "submissions"("id")
          ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "article_chunk_embeddings" (
        "article_id" uuid NOT NULL,
        "chunk_index" integer NOT NULL,
        "embedding" vector(768) NOT NULL,
        "chunk_text" text NOT NULL,
        "category" varchar(120) NOT NULL DEFAULT '',
        "indexed_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_article_chunk_embeddings" PRIMARY KEY ("article_id", "chunk_index"),
        CONSTRAINT "FK_article_chunk_embeddings_submission"
          FOREIGN KEY ("article_id") REFERENCES "submissions"("id")
          ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "reviewer_bio_embeddings" (
        "reviewer_id" uuid NOT NULL,
        "embedding" vector(768) NOT NULL,
        "bio_text" text NOT NULL,
        "display_name" varchar(255),
        "indexed_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_reviewer_bio_embeddings" PRIMARY KEY ("reviewer_id"),
        CONSTRAINT "FK_reviewer_bio_embeddings_user"
          FOREIGN KEY ("reviewer_id") REFERENCES "users"("id")
          ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "ix_article_chunk_embeddings_article_id" ON "article_chunk_embeddings" ("article_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_article_chunk_embeddings_category" ON "article_chunk_embeddings" ("category")`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_article_summary_embeddings_category" ON "article_summary_embeddings" ("category")`,
    );

    // HNSW indexes on empty tables (dev). For production bulk load, prefer
    // CREATE INDEX CONCURRENTLY after backfill instead of incremental inserts.
    await queryRunner.query(`
      CREATE INDEX "ix_article_summary_embeddings_hnsw"
      ON "article_summary_embeddings"
      USING hnsw ("embedding" vector_cosine_ops)
      WITH (m = 16, ef_construction = 64)
    `);
    await queryRunner.query(`
      CREATE INDEX "ix_article_chunk_embeddings_hnsw"
      ON "article_chunk_embeddings"
      USING hnsw ("embedding" vector_cosine_ops)
      WITH (m = 16, ef_construction = 64)
    `);
    await queryRunner.query(`
      CREATE INDEX "ix_reviewer_bio_embeddings_hnsw"
      ON "reviewer_bio_embeddings"
      USING hnsw ("embedding" vector_cosine_ops)
      WITH (m = 16, ef_construction = 64)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "ix_reviewer_bio_embeddings_hnsw"`);
    await queryRunner.query(`DROP INDEX "ix_article_chunk_embeddings_hnsw"`);
    await queryRunner.query(`DROP INDEX "ix_article_summary_embeddings_hnsw"`);
    await queryRunner.query(
      `DROP INDEX "ix_article_summary_embeddings_category"`,
    );
    await queryRunner.query(
      `DROP INDEX "ix_article_chunk_embeddings_category"`,
    );
    await queryRunner.query(
      `DROP INDEX "ix_article_chunk_embeddings_article_id"`,
    );
    await queryRunner.query(`DROP TABLE "reviewer_bio_embeddings"`);
    await queryRunner.query(`DROP TABLE "article_chunk_embeddings"`);
    await queryRunner.query(`DROP TABLE "article_summary_embeddings"`);
  }
}
