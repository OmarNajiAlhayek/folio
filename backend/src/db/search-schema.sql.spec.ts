import { readFileSync } from 'fs';
import {
  GENERATED_SQL_PATH,
  generatedSql,
} from '../../scripts/generate-search-schema-sql';
import {
  SEARCH_SCHEMA_SQL,
  SEARCH_SCHEMA_SQL_WITHOUT_BACKFILL,
} from './search-schema.sql';

/**
 * `scripts/setup-publication-search.sql` is generated from the constant the
 * migration runs. Before, the file was hand-maintained and the migration did not
 * contain it at all, so a `migrate:prod`-only database got the columns but not
 * the trigger that fills them — and the catalog silently returned nothing.
 */
describe('generated setup-publication-search.sql', () => {
  it('matches the constant the migration applies', () => {
    const onDisk = readFileSync(GENERATED_SQL_PATH, 'utf8');
    expect(onDisk).toBe(generatedSql());
  });

  it('is marked as generated, so nobody hand-edits it', () => {
    const onDisk = readFileSync(GENERATED_SQL_PATH, 'utf8');
    expect(onDisk).toContain('GENERATED FILE');
    expect(onDisk).toContain('npm run db:search-sql');
  });
});

describe('SEARCH_SCHEMA_SQL', () => {
  it('installs pg_trgm, which nothing else does', () => {
    // similarity() and the gin_trgm_ops indexes below are unusable without it.
    expect(SEARCH_SCHEMA_SQL).toContain(
      'CREATE EXTENSION IF NOT EXISTS pg_trgm',
    );
  });

  it('is idempotent in every statement', () => {
    const creates =
      SEARCH_SCHEMA_SQL.match(/CREATE (TRIGGER|INDEX|EXTENSION|FUNCTION)/g) ??
      [];
    expect(creates.length).toBeGreaterThan(0);

    // Indexes and extensions guard with IF NOT EXISTS; functions use OR REPLACE;
    // the trigger is dropped first.
    expect(SEARCH_SCHEMA_SQL).not.toMatch(/CREATE INDEX (?!IF NOT EXISTS)/);
    expect(SEARCH_SCHEMA_SQL).not.toMatch(/CREATE EXTENSION (?!IF NOT EXISTS)/);
    expect(SEARCH_SCHEMA_SQL).not.toMatch(/CREATE FUNCTION /);
    expect(SEARCH_SCHEMA_SQL).toContain(
      'DROP TRIGGER IF EXISTS trg_submissions_publication_search',
    );
    expect(SEARCH_SCHEMA_SQL).not.toMatch(/ADD COLUMN (?!IF NOT EXISTS)/);
  });

  it('marks the normalizer IMMUTABLE so generated columns can use it', () => {
    expect(SEARCH_SCHEMA_SQL).toMatch(
      /CREATE OR REPLACE FUNCTION folio_normalize_search[\s\S]*?IMMUTABLE/,
    );
  });

  it('never reaches for unaccent, which is only STABLE', () => {
    expect(SEARCH_SCHEMA_SQL).not.toContain('unaccent');
  });

  it('normalizes the trigram document but not the tsvector', () => {
    // The dictionaries do their own normalization; folding first would hide
    // word boundaries from them.
    expect(SEARCH_SCHEMA_SQL).toMatch(
      /publication_search_document := folio_normalize_search\(/,
    );
    expect(SEARCH_SCHEMA_SQL).toMatch(
      /publication_search_vector :=\s*\n\s*setweight\(to_tsvector\('english'/,
    );
  });

  it('gives both searchable directories a normalized column and a trigram index', () => {
    for (const table of ['users', 'journals']) {
      expect(SEARCH_SCHEMA_SQL).toContain(
        `ALTER TABLE ${table}\n  ADD COLUMN IF NOT EXISTS search_normalized text`,
      );
      expect(SEARCH_SCHEMA_SQL).toContain(
        `ON ${table} USING GIN (search_normalized gin_trgm_ops)`,
      );
    }
  });

  it('folds the character classes Arabic search depends on', () => {
    // Tatweel, harakat and the bidi invisibles.
    expect(SEARCH_SCHEMA_SQL).toContain('\\u0640');
    expect(SEARCH_SCHEMA_SQL).toContain('\\u064B-\\u065F');
    expect(SEARCH_SCHEMA_SQL).toContain('\\u200B-\\u200F');
    // Alef carriers, and the fold targets they map onto.
    const folds = SEARCH_SCHEMA_SQL.match(/'([^']*أ[^']*)',\s*\n\s*'([^']*)'/);
    expect(folds).not.toBeNull();
    const [, from, to] = folds!;
    // Bare hamza is last and has no counterpart, so translate() deletes it.
    expect(from.endsWith('ء')).toBe(true);
    expect(from).toHaveLength(to.length + 1);
    // Every folded character must actually change, or the table is a no-op.
    for (const [i, ch] of [...to].entries()) {
      expect(ch).not.toBe(from[i]);
    }
    expect(SEARCH_SCHEMA_SQL).toContain('01234567890123456789');
  });

  it('offers a backfill-free variant for callers that seed their own rows', () => {
    // The unqualified statement is the backfill. The rename trigger contains a
    // WHERE-scoped one, so match the whole statement rather than a prefix.
    const backfill = 'UPDATE submissions SET title = title;';
    expect(SEARCH_SCHEMA_SQL_WITHOUT_BACKFILL).not.toContain(backfill);
    expect(SEARCH_SCHEMA_SQL).toContain(backfill);
  });

  it('denormalizes the author name so catalog search need not join users', () => {
    expect(SEARCH_SCHEMA_SQL).toContain(
      'ADD COLUMN IF NOT EXISTS publication_author_normalized text',
    );
    expect(SEARCH_SCHEMA_SQL).toContain(
      'ON submissions USING GIN (publication_author_normalized gin_trgm_ops)',
    );
    // Re-derived whenever the submission's author changes...
    expect(SEARCH_SCHEMA_SQL).toMatch(
      /BEFORE INSERT OR UPDATE OF[\s\S]*?author_id/,
    );
    // ...and whenever that author is renamed, or the copy would go stale.
    expect(SEARCH_SCHEMA_SQL).toContain(
      'AFTER UPDATE OF display_name ON users',
    );
    expect(SEARCH_SCHEMA_SQL).toContain(
      'UPDATE submissions SET title = title WHERE author_id = NEW.id',
    );
  });

  it('guards the rename trigger against no-op updates', () => {
    expect(SEARCH_SCHEMA_SQL).toContain(
      'WHEN (OLD.display_name IS DISTINCT FROM NEW.display_name)',
    );
  });

  it('keeps the author out of the tsvector', () => {
    // The tsquery branches search with the raw query, so a folded author lexeme
    // would be unreachable from them and an unfolded one would not fold. Author
    // matching lives in the two normalized paths instead.
    expect(SEARCH_SCHEMA_SQL).not.toContain(
      "to_tsvector('simple', author_name)",
    );
    expect(SEARCH_SCHEMA_SQL).toContain('NEW.publication_author_normalized :=');
  });
});
