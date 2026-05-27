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
echo Requires Postgres ^(same DB_* as backend/.env and email-service/.env^).
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
