-- Creates the `folio` database used by the email-service.
-- The primary `folio_review` database is created automatically via POSTGRES_DB.
SELECT 'CREATE DATABASE folio'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'folio')\gexec

-- pgvector for ai-service embedding tables (TypeORM migration also enables this).
CREATE EXTENSION IF NOT EXISTS vector;

-- Query statistics for perf runs and ops (requires shared_preload_libraries in postgres command).
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
