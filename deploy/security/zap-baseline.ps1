# OWASP ZAP baseline (passivo) — somente ambiente de teste.
# Uso (raiz do repo):
#   .\deploy\security\zap-baseline.ps1
#   .\deploy\security\zap-baseline.ps1 -Target "https://alleone-teste.alletecnologia.com"

param(
  [string]$Target = "https://alleone-teste.alletecnologia.com"
)

$ErrorActionPreference = "Stop"
$Target = $Target.TrimEnd("/")

if ($Target -notmatch "teste") {
  Write-Error "Recusado: o alvo precisa ser ambiente de teste (URL contendo 'teste'). Alvo: $Target"
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Error "Docker nao encontrado. Instale Docker Desktop e tente de novo."
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$outDir = Join-Path $repoRoot "deploy\security\out"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$work = ($outDir -replace "\\", "/")
# Docker Desktop no Windows aceita caminho Windows no -v.
Write-Host "ZAP baseline -> $Target"
Write-Host "Relatorio: $outDir\zap-report.html"

docker run --rm `
  -v "${outDir}:/zap/wrk/:rw" `
  -t ghcr.io/zaproxy/zaproxy:stable `
  zap-baseline.py -t $Target -r zap-report.html -I

Write-Host "Concluido. Abra deploy/security/out/zap-report.html"
