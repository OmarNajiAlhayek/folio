# Install pgvector prebuilt binaries for PostgreSQL 17 on Windows (native dev).
# Run as Administrator: right-click PowerShell -> Run as administrator, then:
#   Set-ExecutionPolicy -Scope Process Bypass
#   & ".\scripts\install-pgvector-windows.ps1"
#
# Uses community builds from https://github.com/andreiramani/pgvector_pgsql_windows
# (not official pgvector releases). Required for backend migrations on native Postgres.

$ErrorActionPreference = 'Stop'

$pgRoot = 'C:\Program Files\PostgreSQL\17'
if (-not (Test-Path $pgRoot)) {
  Write-Error "PostgreSQL 17 not found at $pgRoot. Adjust `$pgRoot in this script."
}

$zipUrl = 'https://github.com/andreiramani/pgvector_pgsql_windows/releases/download/0.8.2_17.6/vector.v0.8.2-pg17.zip'
$workDir = Join-Path $env:TEMP 'folio-pgvector-install'
$zipPath = Join-Path $workDir 'vector.zip'

New-Item -ItemType Directory -Force -Path $workDir | Out-Null
Write-Host "Downloading pgvector for PostgreSQL 17..."
Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath
Expand-Archive -Path $zipPath -DestinationPath $workDir -Force

$src = Get-ChildItem -Path $workDir -Directory | Where-Object { Test-Path (Join-Path $_.FullName 'lib\vector.dll') } | Select-Object -First 1
if (-not $src) {
  Write-Error 'Could not find vector.dll in extracted archive.'
}

Write-Host "Installing into $pgRoot (stop PostgreSQL service first if copy fails)..."
Copy-Item (Join-Path $src.FullName 'lib\vector.dll') (Join-Path $pgRoot 'lib\') -Force
Copy-Item (Join-Path $src.FullName 'share\extension\*') (Join-Path $pgRoot 'share\extension\') -Force

Write-Host 'Done. Restart PostgreSQL service, then run:'
Write-Host '  psql -U postgres -d folio_review -c "CREATE EXTENSION IF NOT EXISTS vector;"'
