@echo off
REM Install pgvector for PostgreSQL 17 (native Windows dev). Requires Administrator.
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process powershell -Verb RunAs -Wait -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File \"%~dp0install-pgvector-windows.ps1\"'"
echo.
echo If install succeeded, restart PostgreSQL and run:
echo   psql -U postgres -d folio_review -c "CREATE EXTENSION IF NOT EXISTS vector;"
echo   cd backend ^&^& npm run migrate ^&^& npm run seed
