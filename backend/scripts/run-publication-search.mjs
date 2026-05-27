/**
 * Applies setup-publication-search.sql using DB_* from backend/.env
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendRoot = join(__dirname, '..');

dotenv.config({ path: join(backendRoot, '.env') });

const sqlPath = join(__dirname, 'setup-publication-search.sql');
const sql = readFileSync(sqlPath, 'utf8');

const client = new pg.Client({
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  user: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_DATABASE ?? 'folio_review',
});

async function main() {
  await client.connect();
  try {
    await client.query(sql);
    const { rows } = await client.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_name = 'submissions'
         AND column_name IN (
           'publication_search_document',
           'publication_search_vector'
         )
       ORDER BY column_name`,
    );
    if (rows.length < 2) {
      console.error(
        'Script ran but publication_search_* columns are missing. Check PostgreSQL logs.',
      );
      process.exit(1);
    }
    console.log(
      'Publication search schema OK:',
      rows.map((r) => r.column_name).join(', '),
    );
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
