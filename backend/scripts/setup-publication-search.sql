-- GENERATED FILE — do not edit.
--
-- Source:     src/db/search-schema.sql.ts
-- Regenerate: cd backend && npm run db:search-sql
--
-- A normal deploy needs none of this: `npm run migrate` applies the same DDL
-- via the SearchNormalization migration. This file exists to repair an older
-- database that predates that migration.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE OR REPLACE FUNCTION folio_normalize_search(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT btrim(
    regexp_replace(
      -- Postgres lower() is not a case *fold*: it leaves eszett alone where
      -- Python's str.casefold() expands it. Applied after lower() so 'ẞ' has
      -- already become 'ß'.
      replace(
      lower(
        translate(
          translate(
            regexp_replace(
              normalize(coalesce(input, ''), NFKC),
              -- Combining marks, invisibles, tatweel and underscore: dropped
              -- outright so they never split or alter a word. Written as escapes
              -- because the characters themselves are invisible in an editor.
              '[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u08D3-\u08FF\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFE00-\uFE0F\u0640_]',
              '',
              'g'
            ),
            -- Alef carriers, ya/alef-maqsura, hamza carriers, ta-marbuta and the
            -- Farsi/Urdu glyphs that leak in from scanned PDFs. Greek final sigma
            -- folds to sigma, which lower() alone will not do. Bare hamza has no
            -- counterpart below, so translate() deletes it.
            'أإآٱٲٳٵىیؤئةکگھەςء',
            'اااااااييويهككههσ'
          ),
          -- Arabic-Indic and extended Arabic-Indic digits to ASCII.
          '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹',
          '01234567890123456789'
        )
      ), 'ß', 'ss'),
      '[^[:alnum:]]+', ' ', 'g'
    )
  )
$$;


ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS publication_search_document text;

ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS publication_search_vector tsvector;

ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS publication_author_normalized text;

CREATE OR REPLACE FUNCTION submissions_refresh_publication_search()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  author_name text := '';
BEGIN
  -- The author's name is denormalized onto the submission so catalog search
  -- can match it without joining users. `trg_users_refresh_publication_search`
  -- below is what keeps it from going stale when somebody is renamed.
  IF NEW.author_id IS NOT NULL THEN
    SELECT coalesce(u.display_name, '') INTO author_name
    FROM users u
    WHERE u.id = NEW.author_id;
  END IF;

  NEW.publication_author_normalized := folio_normalize_search(author_name);

  NEW.publication_search_document := folio_normalize_search(
    concat_ws(
      ' ',
      NEW.title,
      NEW.title_ar,
      NEW.abstract,
      NEW.abstract_ar,
      NEW.keywords,
      NEW.keywords_ar,
      author_name
    )
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
  -- The author is deliberately NOT in the tsvector. The tsquery branches search
  -- it with the *raw* query, because the language dictionaries expect raw input,
  -- so a folded author lexeme could never be reached from them and an unfolded
  -- one would defeat the point. Author matching belongs to the two normalized
  -- paths instead: the trigram document above and publication_author_normalized,
  -- which both fold each side identically.

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_submissions_publication_search ON submissions;

CREATE TRIGGER trg_submissions_publication_search
  BEFORE INSERT OR UPDATE OF
    title,
    title_ar,
    abstract,
    abstract_ar,
    keywords,
    keywords_ar,
    author_id
  ON submissions
  FOR EACH ROW
  EXECUTE FUNCTION submissions_refresh_publication_search();

/*
 * Keeps the denormalized author name current.
 *
 * Renames are rare and an author has few publications, so rewriting their rows
 * inline is cheaper than the alternative: joining users on every catalog search
 * forever. Touching `title` re-fires the BEFORE trigger above, which re-reads
 * the name — there is no second copy of the projection logic.
 */
CREATE OR REPLACE FUNCTION users_refresh_publication_search()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE submissions SET title = title WHERE author_id = NEW.id;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_refresh_publication_search ON users;

CREATE TRIGGER trg_users_refresh_publication_search
  AFTER UPDATE OF display_name ON users
  FOR EACH ROW
  WHEN (OLD.display_name IS DISTINCT FROM NEW.display_name)
  EXECUTE FUNCTION users_refresh_publication_search();

CREATE INDEX IF NOT EXISTS idx_submissions_publication_search_vector
  ON submissions USING GIN (publication_search_vector);

CREATE INDEX IF NOT EXISTS idx_submissions_publication_search_document_trgm
  ON submissions USING GIN (publication_search_document gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_submissions_publication_author_trgm
  ON submissions USING GIN (publication_author_normalized gin_trgm_ops);


ALTER TABLE users
  ADD COLUMN IF NOT EXISTS search_normalized text
  GENERATED ALWAYS AS (
    folio_normalize_search(coalesce(display_name, '') || ' ' || coalesce(email, ''))
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_users_search_normalized_trgm
  ON users USING GIN (search_normalized gin_trgm_ops);

ALTER TABLE journals
  ADD COLUMN IF NOT EXISTS search_normalized text
  GENERATED ALWAYS AS (
    folio_normalize_search(
      coalesce(title_en, '') || ' ' ||
      coalesce(title_ar, '') || ' ' ||
      coalesce(description_en, '') || ' ' ||
      coalesce(description_ar, '') || ' ' ||
      coalesce(discipline_label, '')
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_journals_search_normalized_trgm
  ON journals USING GIN (search_normalized gin_trgm_ops);


UPDATE submissions SET title = title;

