@echo off
setlocal EnableDelayedExpansion

rem Bootstrap LM Studio for ai-service when .env points at the local OpenAI-compatible API.
rem Called from run-dev.bat (uses this script's directory as the repo root).

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

set "ENV_FILE=%ROOT%\services\ai-service\.env"
set "AI_PROVIDER="
set "OPENAI_MODEL="
set "OPENAI_BASE_URL="
set "LM_PORT=1234"

if not exist "%ENV_FILE%" (
  echo [LM Studio] No services\ai-service\.env — skipping.
  exit /b 0
)

for /f "usebackq tokens=1,* delims==" %%A in (`findstr /i /b /r "^AI_PROVIDER= ^OPENAI_MODEL= ^OPENAI_BASE_URL=" "%ENV_FILE%" 2^>nul`) do (
  set "key=%%A"
  set "val=%%B"
  if defined val set "val=!val:"=!"
  if /i "!key!"=="AI_PROVIDER" set "AI_PROVIDER=!val!"
  if /i "!key!"=="OPENAI_MODEL" set "OPENAI_MODEL=!val!"
  if /i "!key!"=="OPENAI_BASE_URL" set "OPENAI_BASE_URL=!val!"
)

if /i not "!AI_PROVIDER!"=="openai" (
  echo [LM Studio] AI_PROVIDER is not openai — skipping.
  exit /b 0
)

set "USE_LM=0"
echo !OPENAI_BASE_URL! | findstr /i /c:"localhost:1234" /c:"127.0.0.1:1234" /c:"[::1]:1234" >nul 2>&1 && set "USE_LM=1"
if "!USE_LM!"=="0" (
  echo [LM Studio] OPENAI_BASE_URL is not localhost:1234 — skipping.
  exit /b 0
)

if not defined OPENAI_MODEL (
  echo [WARN] OPENAI_MODEL is not set in services\ai-service\.env — cannot load a model.
  exit /b 0
)

set "LMS=%USERPROFILE%\.lmstudio\bin\lms.exe"
if not exist "%LMS%" (
  echo [WARN] LM Studio CLI not found at "%LMS%".
  echo        Install LM Studio and open it once so the CLI is bootstrapped.
  exit /b 0
)

set "LM_GUI=%LOCALAPPDATA%\Programs\LM Studio\LM Studio.exe"
if exist "%LM_GUI%" (
  tasklist /FI "IMAGENAME eq LM Studio.exe" 2>nul | find /i "LM Studio.exe" >nul
  if errorlevel 1 (
    echo Opening LM Studio ^(first launch can take 30-60s before the API is ready^)...
    start "" "%LM_GUI%"
  ) else (
    echo LM Studio is already running.
  )
) else (
  echo [WARN] LM Studio app not found at "%LM_GUI%" — using CLI only.
)

echo Waiting for LM Studio API on port %LM_PORT%...
set "API_TRIES=0"
:wait_api
curl -sf "http://127.0.0.1:%LM_PORT%/v1/models" >nul 2>&1
if not errorlevel 1 goto api_ready
set /a API_TRIES+=1
if !API_TRIES! GEQ 60 (
  echo [WARN] LM Studio API not reachable on port %LM_PORT% after ~2 min.
  echo        In LM Studio: Developer ^> Start server ^(port %LM_PORT%^), then run:
  echo          dev-lmstudio.bat
  exit /b 0
)
ping -n 3 127.0.0.1 >nul
goto wait_api

:api_ready
echo LM Studio API is up on port %LM_PORT%.

rem Give the GUI a moment to finish syncing lms auth keys after extracting lms.exe.
ping -n 4 127.0.0.1 >nul

"%LMS%" ps 2>nul | findstr /i "!OPENAI_MODEL!" >nul
if not errorlevel 1 (
  echo LM Studio model "!OPENAI_MODEL!" is already loaded.
  goto :done
)

echo Loading LM Studio model "!OPENAI_MODEL!" ^(keywords + copyedit use this model^)...
set "LOAD_TRIES=0"
:try_load
set /a LOAD_TRIES+=1
"%LMS%" load "!OPENAI_MODEL!" -y --identifier "!OPENAI_MODEL!"
if not errorlevel 1 goto load_ok
if !LOAD_TRIES! GEQ 5 (
  echo [WARN] lms load failed after 5 attempts ^(CLI auth may still be syncing^).
  echo        Load "!OPENAI_MODEL!" manually in LM Studio, or re-run: dev-lmstudio.bat
  goto :done
)
echo Retrying lms load ^(!LOAD_TRIES!/5^)...
ping -n 5 127.0.0.1 >nul
goto try_load

:load_ok
echo LM Studio model "!OPENAI_MODEL!" is ready.

:done
endlocal
exit /b 0
