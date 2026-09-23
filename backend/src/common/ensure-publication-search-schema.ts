import type { DataSource } from 'typeorm';
import { SEARCH_SCHEMA_SQL } from '../db/search-schema.sql';

/**
 * Idempotent search schema: normalization function, FTS/trigram columns,
 * triggers and indexes.
 *
 * Runs the same statements as the `SearchNormalization` migration, from the
 * same constant, so the seed path and a migrated database cannot diverge. It
 * used to read `scripts/setup-publication-search.sql` off disk, which is why
 * that file could drift from what migrations produced — and why `migrate:prod`
 * alone left the catalog unsearchable.
 */
export async function ensurePublicationSearchSchema(
  dataSource: DataSource,
): Promise<void> {
  await dataSource.query(SEARCH_SCHEMA_SQL);
}
