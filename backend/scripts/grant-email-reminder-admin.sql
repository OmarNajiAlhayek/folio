-- Grants required for the Nest backend to read/update `email.reminder`
-- via parameterized SQL (reminder admin API).
--
-- Run as a superuser (or schema owner), for example:
--   psql -U postgres -d folio_review -f backend/scripts/grant-email-reminder-admin.sql
--
-- Replace `postgres` below if your backend uses a different `DB_USERNAME`.

GRANT USAGE ON SCHEMA email TO postgres;

GRANT SELECT, UPDATE ON TABLE email.reminder TO postgres;
