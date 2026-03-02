$ErrorActionPreference = 'Stop'

# 1. Configuração de Caminhos
$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectDir

$pbExe = Join-Path $projectDir 'pocketbase.exe'
$pbUrl = 'http://127.0.0.1:8090'
$pbHealth = "$pbUrl/api/health"
$indexFile = Join-Path $projectDir 'index.html' # Seu arquivo principal

# 2. Verificação do Executável
if (-not (Test-Path $pbExe)) {
    Write-Host 'ERRO: pocketbase.exe não encontrado!' -ForegroundColor Red
    exit 1
}

# 3. Iniciar PocketBase (se não estiver rodando)
try {
    Invoke-RestMethod -Uri $pbHealth -Method Get | Out-Null
    Write-Host "PocketBase já estava ativo." -ForegroundColor Cyan
} catch {
    Write-Host "Iniciando PocketBase..." -ForegroundColor Green
    Start-Process -FilePath $pbExe -ArgumentList 'serve --http=127.0.0.1:8090' -WindowStyle Hidden
    
    # Aguarda o banco "acordar"
    $tentativas = 15
    for ($i = 1; $i -le $tentativas; $i++) {
        Start-Sleep -Milliseconds 500
        try {
            Invoke-RestMethod -Uri $pbHealth -Method Get | Out-Null
            break
        } catch {}
    }
}

# 4. Abrir o seu Projeto no Navegador
Write-Host "Abrindo seu sistema de atestados..." -ForegroundColor Yellow
if (Test-Path $indexFile) {
    # Abre o arquivo HTML local no navegador padrão
    Start-Process $indexFile
} else {
    # Se não achar o index, abre o Admin do PocketBase para você ver os dados
    Start-Process "$pbUrl/_/"
}

Write-Host "Tudo pronto, Raphael! Bom trabalho." -ForegroundColor Green