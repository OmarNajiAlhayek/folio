import { readFileSync } from 'fs';
import { join } from 'path';
import type { DataSource } from 'typeorm';

/** Idempotent FTS/trigram columns + trigger for public catalog search. */
export async function ensurePublicationSearchSchema(
  dataSource: DataSource,
): Promise<void> {
  const sqlPath = join(
    __dirname,
    '..',
    '..',
    'scripts',
    'setup-publication-search.sql',
  );
  const sql = readFileSync(sqlPath, 'utf8');
  await dataSource.query(sql);
}
