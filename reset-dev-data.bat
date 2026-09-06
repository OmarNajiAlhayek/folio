@echo off
setlocal

set "ROOT=%~dp0"

if not exist "%ROOT%backend\package.json" (
  echo [ERROR] backend\package.json not found.
  exit /b 1
)

if not exist "%ROOT%services\email-service\package.json" (
  echo [ERROR] services\email-service\package.json not found.
  exit /b 1
)

echo.
echo === Folio dev reset: email migrations + fresh seed ===
echo Requires postgres-email ^(email-service DB_*^) and backend Postgres for seed:fresh.
echo.
echo   *** THIS PERMANENTLY DELETES DATA ***
echo   seed:fresh truncates users, submissions, reviews, notifications and
echo   the outbox, and clears the uploads directory. There is no undo.
echo.

rem Show the operator which database is about to be wiped. The seed itself
rem refuses any non-local target, but the point is to notice before typing.
for /f "usebackq tokens=1,* delims==" %%A in ("%ROOT%backend\.env") do (
  if /i "%%A"=="DB_HOST"     set "TARGET_HOST=%%B"
  if /i "%%A"=="DB_PORT"     set "TARGET_PORT=%%B"
  if /i "%%A"=="DB_DATABASE" set "TARGET_DB=%%B"
  if /i "%%A"=="NODE_ENV"    set "TARGET_ENV=%%B"
)
if not defined TARGET_HOST set "TARGET_HOST=localhost"
if not defined TARGET_PORT set "TARGET_PORT=5432"
if not defined TARGET_DB   set "TARGET_DB=folio_review"
if not defined TARGET_ENV  set "TARGET_ENV=development"

echo   Target:   %TARGET_HOST%:%TARGET_PORT%/%TARGET_DB%
echo   NODE_ENV: %TARGET_ENV%
echo.

set "CONFIRM="
set /p "CONFIRM=Type the database name (%TARGET_DB%) to continue, or press Enter to abort: "
if /i not "%CONFIRM%"=="%TARGET_DB%" (
  echo.
  echo Aborted. Nothing was changed.
  exit /b 1
)

echo.
echo [1/2] Running email-service migrations...
cd /d "%ROOT%services\email-service"
call npm run migrate
if errorlevel 1 (
  echo [ERROR] email-service migrate failed.
  exit /b 1
)

echo.
echo [2/2] Running backend seed:fresh ^(truncates users/submissions, re-seeds^)...
cd /d "%ROOT%backend"
set "FOLIO_ALLOW_DESTRUCTIVE_SEED=1"
call npm run seed:fresh
if errorlevel 1 (
  echo [ERROR] backend seed:fresh failed.
  exit /b 1
)

echo.
echo Done. Email templates updated from migrations; app data reset and re-seeded.
echo Start apps with run-dev.bat when ready.
echo.

endlocal
exit /b 0
