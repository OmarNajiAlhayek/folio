-- Publication catalog search (FTS + pg_trgm). Run once per environment:
--   cd backend && npm run db:publication-search
-- Uses triggers (not GENERATED columns) because to_tsvector is not IMMUTABLE in PostgreSQL.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS publication_search_document text;

ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS publication_search_vector tsvector;

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

DROP TRIGGER IF EXISTS trg_submissions_publication_search ON submissions;

CREATE TRIGGER trg_submissions_publication_search
  BEFORE INSERT OR UPDATE OF
    title,
    title_ar,
    abstract,
    abstract_ar,
    keywords,
    keywords_ar
  ON submissions
  FOR EACH ROW
  EXECUTE FUNCTION submissions_refresh_publication_search();

CREATE INDEX IF NOT EXISTS idx_submissions_publication_search_vector
  ON submissions USING GIN (publication_search_vector);

CREATE INDEX IF NOT EXISTS idx_submissions_publication_search_document_trgm
  ON submissions USING GIN (publication_search_document gin_trgm_ops);

-- Backfill all rows (trigger runs per row).
UPDATE submissions
SET
  title = title
WHERE publication_search_vector IS NULL
   OR publication_search_document IS NULL;
