@echo off
setlocal
set "ROOT=%~dp0.."

echo === Folio native DB bootstrap ===
echo Requires: folio_review + folio_email on localhost:5432, pgvector on folio_review
echo.

where psql >nul 2>&1
if errorlevel 1 (
  echo [ERROR] psql not in PATH. Add PostgreSQL bin to PATH.
  exit /b 1
)

set "PGPASSWORD=0000"
psql -U postgres -h localhost -p 5432 -d folio_review -tc "SELECT 1 FROM pg_extension WHERE extname = 'vector'" | findstr /C:"1" >nul
if errorlevel 1 (
  echo [ERROR] pgvector extension not installed on folio_review.
  echo Run scripts\install-pgvector-windows.bat as Administrator, restart PostgreSQL, then:
  echo   psql -U postgres -d folio_review -c "CREATE EXTENSION IF NOT EXISTS vector;"
  exit /b 1
)

echo [1/4] Backend migrations...
cd /d "%ROOT%\backend"
call npm run migrate
if errorlevel 1 exit /b 1

echo [2/4] Backend seed...
call npm run seed
if errorlevel 1 exit /b 1

echo [3/4] Email schema (if missing)...
psql -U postgres -h localhost -p 5432 -d folio_email -c "CREATE SCHEMA IF NOT EXISTS email;"

echo [4/4] Email-service migrations...
cd /d "%ROOT%\services\email-service"
call npm run migrate
if errorlevel 1 exit /b 1

echo.
echo Done. Start apps with run-dev.bat
endlocal
