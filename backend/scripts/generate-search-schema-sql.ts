/**
 * Regenerates `scripts/setup-publication-search.sql` from the canonical
 * TypeScript constant, so the file `npm run db:publication-search` applies is
 * always the same DDL the SearchNormalization migration runs.
 *
 *   cd backend && npm run db:search-sql
 *
 * `src/db/search-schema.sql.spec.ts` fails if the two fall out of step, so the
 * generated file cannot quietly drift from the migration.
 */
import { writeFileSync } from 'fs';
import { join } from 'path';
import { SEARCH_SCHEMA_SQL } from '../src/db/search-schema.sql';

export const GENERATED_SQL_HEADER = `-- GENERATED FILE — do not edit.
--
-- Source:     src/db/search-schema.sql.ts
-- Regenerate: cd backend && npm run db:search-sql
--
-- A normal deploy needs none of this: \`npm run migrate\` applies the same DDL
-- via the SearchNormalization migration. This file exists to repair an older
-- database that predates that migration.
`;

export const GENERATED_SQL_PATH = join(
  __dirname,
  'setup-publication-search.sql',
);

/** The exact bytes the .sql file should contain. */
export function generatedSql(): string {
  return `${GENERATED_SQL_HEADER}${SEARCH_SCHEMA_SQL}\n`;
}

if (require.main === module) {
  writeFileSync(GENERATED_SQL_PATH, generatedSql(), 'utf8');
  console.log(`wrote ${GENERATED_SQL_PATH}`);
}
