$ErrorActionPreference = 'Stop'

$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectDir

$pbExe = Join-Path $projectDir 'pocketbase.exe'

if (-not (Test-Path $pbExe)) {
  Write-Host 'pocketbase.exe não encontrado na pasta do projeto.' -ForegroundColor Yellow
  Write-Host 'Baixe o PocketBase para Windows e copie o pocketbase.exe para esta pasta:' -ForegroundColor Yellow
  Write-Host $projectDir -ForegroundColor Cyan
  exit 1
}

Write-Host 'Iniciando PocketBase em http://127.0.0.1:8090 ...' -ForegroundColor Green
& $pbExe serve
