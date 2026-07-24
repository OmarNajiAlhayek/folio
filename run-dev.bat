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

if not exist "%ROOT%services\ai-service\pyproject.toml" (
  echo [ERROR] services\ai-service\pyproject.toml not found.
  exit /b 1
)

echo Starting dev infrastructure ^(docker-compose.infra.yml^)...
echo   RabbitMQ 5672, LanguageTool 8010, Typesense 8108 ^(Postgres runs natively on host^)
docker compose -f "%ROOT%docker-compose.infra.yml" up -d
if errorlevel 1 (
  echo [WARN] docker compose failed — ensure Docker is running. Apps need native Postgres and RabbitMQ ^(5672^).
  goto launch_apps
)

echo Waiting for RabbitMQ to accept AMQP connections...
set "RABBIT_TRIES=0"
:wait_rabbit
docker compose -f "%ROOT%docker-compose.infra.yml" exec -T rabbitmq rabbitmq-diagnostics -q ping >nul 2>&1
if not errorlevel 1 goto rabbit_ready
set /a RABBIT_TRIES+=1
if %RABBIT_TRIES% GEQ 45 (
  echo [WARN] RabbitMQ not ready after ~90s — starting apps anyway ^(they retry AMQP every 5s^).
  goto launch_apps
)
timeout /t 2 /nobreak >nul
goto wait_rabbit
:rabbit_ready
echo RabbitMQ is ready.

:launch_apps
echo Starting backend...
start "folio-backend" cmd /k "cd /d "%ROOT%backend" && npm run start:dev"

echo Starting frontend...
start "folio-frontend" cmd /k "cd /d "%ROOT%frontend" && npm run dev"

echo Starting email-service...
start "folio-email-service" cmd /k "cd /d "%ROOT%services\email-service" && npm run start:dev"

echo Preparing LM Studio for ai-service ^(OPENAI_MODEL from services\ai-service\.env^)...
call "%ROOT%dev-lmstudio.bat"

echo Starting ai-service...
if exist "%ROOT%services\ai-service\.venv\Scripts\python.exe" (
  start "folio-ai-service" cmd /k "cd /d "%ROOT%services\ai-service" && .venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 5245"
) else (
  echo [WARN] services\ai-service\.venv not found — using system python. Run: python -m venv .venv ^&^& pip install -e ".[dev]"
  start "folio-ai-service" cmd /k "cd /d "%ROOT%services\ai-service" && python -m uvicorn app.main:app --reload --port 5245"
)

echo Launched: backend, frontend, email-service, ai-service ^(separate terminals^).
echo Infra: docker-compose.infra.yml ^(RabbitMQ 5672/15672, LanguageTool 8010, Typesense 8108^).
echo Postgres: native host ^(folio_review + folio_email on port 5432^).
echo Backend: npm run start:dev
echo Frontend: npm run dev
echo Email-service: npm run start:dev
echo AI-service: uvicorn app.main:app --reload --port 5245 ^(HTTP 5245, gRPC 5246^)
echo LLM: LM Studio localhost:1234 — model from services\ai-service\.env OPENAI_MODEL

endlocal
