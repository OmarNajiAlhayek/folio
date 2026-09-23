import { MigrationInterface, QueryRunner } from 'typeorm';
import { SEARCH_SCHEMA_SQL } from '../search-schema.sql';

/**
 * Arabic-aware search: normalization function, normalized columns, trigram
 * indexes — and the publication-search schema that was never in a migration.
 *
 * Two things happen here.
 *
 * 1. It closes a live gap. `pg_trgm`, the `publication_search_vector` trigger
 *    and both GIN indexes existed only in `scripts/setup-publication-search.sql`,
 *    run by `npm run db:publication-search` or during seed. The *columns* were in
 *    the Init migration. A database built with `migrate:prod` alone therefore had
 *    permanently-NULL search columns and no `pg_trgm`: catalog full-text search
 *    matched nothing, and `similarity()` raised "function does not exist". None of
 *    it failed loudly — the catalog just came back empty.
 *
 * 2. It adds `folio_normalize_search`, the SQL twin of
 *    `packages/shared/text/search-normalize.ts`, and normalized generated columns
 *    on `users` and `journals`. Without it, searching `احمد` does not find `أحمد`,
 *    `هندسه` does not find `هندسة`, and `٢٠٢٤` does not find `2024` — on a platform
 *    whose primary language is Arabic.
 *
 * The DDL lives in `../search-schema.sql.ts` so the seed path runs exactly the
 * same statements. Every statement is idempotent.
 *
 * `down()` removes what this migration added but leaves `pg_trgm` installed and
 * leaves the publication-search columns in place: they predate this migration
 * (Init created them) and other code reads them.
 */
export class SearchNormalization1783800000000 implements MigrationInterface {
  name = 'SearchNormalization1783800000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(SEARCH_SCHEMA_SQL);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_journals_search_normalized_trgm`,
    );
    await queryRunner.query(
      `ALTER TABLE journals DROP COLUMN IF EXISTS search_normalized`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_users_search_normalized_trgm`,
    );
    await queryRunner.query(
      `ALTER TABLE users DROP COLUMN IF EXISTS search_normalized`,
    );

    // Put the trigger back the way the old script wrote it, so a rollback does
    // not leave the catalog searching a normalized document with raw queries.
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION submissions_refresh_publication_search()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        NEW.publication_search_document := concat_ws(
          ' ',
          NEW.title,
          NEW.title_ar,
          NEW.abstract,
          NEW.abstract_ar,
          NEW.keywords,
          NEW.keywords_ar
        );

        NEW.publication_search_vector :=
          setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A')
          || setweight(to_tsvector('arabic', coalesce(NEW.title_ar, '')), 'A')
          || setweight(to_tsvector('english', coalesce(NEW.abstract, '')), 'B')
          || setweight(to_tsvector('arabic', coalesce(NEW.abstract_ar, '')), 'B')
          || setweight(
            to_tsvector(
              'simple',
              coalesce(NEW.keywords, '') || ' ' || coalesce(NEW.keywords_ar, '')
            ),
            'C'
          );

        RETURN NEW;
      END;
      $$;
    `);
    await queryRunner.query(`UPDATE submissions SET title = title`);

    // Dropped last: the columns above depend on it.
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS folio_normalize_search(text)`,
    );
  }
}
