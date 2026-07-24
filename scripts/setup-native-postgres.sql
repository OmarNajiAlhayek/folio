-- One-time native Postgres setup for Folio (light Docker workflow).
-- Run as superuser, e.g.:
--   psql -U postgres -f scripts/setup-native-postgres.sql
--
-- Requires pgvector on folio_review for backend migrations. Windows:
--   scripts\install-pgvector-windows.bat (Administrator)

SELECT 'CREATE DATABASE folio_review'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'folio_review')\gexec

SELECT 'CREATE DATABASE folio_email'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'folio_email')\gexec

\c folio_email
CREATE SCHEMA IF NOT EXISTS email;

\c folio_review
CREATE EXTENSION IF NOT EXISTS vector;
