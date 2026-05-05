@echo off
setlocal

set "ROOT=%~dp0"

if not exist "%ROOT%frontend\package.json" (
  echo [ERROR] frontend\package.json not found.
  exit /b 1
)

if not exist "%ROOT%backend\package.json" (
  echo [ERROR] backend\package.json not found.
  exit /b 1
)

if not exist "%ROOT%services\email-service\package.json" (
  echo [ERROR] services\email-service\package.json not found.
  exit /b 1
)

echo Starting RabbitMQ ^(docker compose^)...
docker compose -f "%ROOT%docker-compose.dev.yml" up -d
if errorlevel 1 (
  echo [WARN] docker compose failed — ensure Docker is running and RabbitMQ is available on localhost:5672 for email-service.
)

echo Starting backend...
start "folio-backend" cmd /k "cd /d "%ROOT%backend" && npm run start:dev"

echo Starting frontend...
start "folio-frontend" cmd /k "cd /d "%ROOT%frontend" && npm run dev"

echo Starting email-service...
start "folio-email-service" cmd /k "cd /d "%ROOT%services\email-service" && npm run start:dev"

echo Launched: backend, frontend, email-service ^(separate terminals^).
echo Infra: docker-compose.dev.yml ^(RabbitMQ 5672 / management UI 15672^).
echo Backend: npm run start:dev
echo Frontend: npm run dev
echo Email-service: npm run start:dev

endlocal
