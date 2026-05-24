-- Grants required for the Nest backend to use raw SQL against the `email`
-- schema (reminder admin APIs, journal email template/policy editors, and
-- pipeline-status reads on email_log / reminder).
--
-- Run as a superuser (or schema owner), for example:
--   psql -U postgres -d folio_review -f backend/scripts/grant-email-reminder-admin.sql
--
-- Replace `postgres` below if your backend uses a different `DB_USERNAME`.

GRANT USAGE ON SCHEMA email TO postgres;

GRANT SELECT, UPDATE ON TABLE email.reminder TO postgres;

GRANT SELECT, UPDATE ON TABLE email.email_template TO postgres;

GRANT SELECT, UPDATE ON TABLE email.email_reminder_policy TO postgres;

GRANT SELECT ON TABLE email.email_log TO postgres;
