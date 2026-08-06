<#
.SYNOPSIS
  Envia scripts de suporte Alle One do PC para a VM (pasta estavel fora do git).

.DESCRIPTION
  1) Envia para /tmp (sem permissao especial)
  2) Na VM: sudo move para /home/alleone/scripts
  Suporte usa so /home/alleone/scripts - nao depende de git pull.

.EXAMPLE
  .\deploy\scripts\enviar-scripts-suporte.ps1 -RemoteUser ubuntu -RemoteHost 10.173.47.30
#>
param(
  [Parameter(Mandatory = $true)]
  [string]$RemoteHost,

  [Parameter(Mandatory = $false)]
  [string]$RemoteUser = "ubuntu",

  [Parameter(Mandatory = $false)]
  [string]$RemoteScriptsDir = "/home/alleone/scripts"
)

$ErrorActionPreference = "Stop"

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$LocalDeployScripts = Join-Path $RepoRoot "deploy\scripts"
$LocalSuporte = Join-Path $LocalDeployScripts "suporte"

$LibFiles = @(
  "restart-alleone-prod.sh",
  "restart-alleone-teste.sh",
  "pos-deploy-alleone.sh",
  "pos-deploy-alleone-teste.sh"
)

$WrapperFiles = @(
  "reiniciar-prod.sh",
  "reiniciar-teste.sh",
  "atualizar-prod.sh",
  "atualizar-teste.sh",
  "README.md"
)

foreach ($f in $LibFiles) {
  $p = Join-Path $LocalDeployScripts $f
  if (-not (Test-Path $p)) { throw "Arquivo ausente: $p" }
}
foreach ($f in $WrapperFiles) {
  $p = Join-Path $LocalSuporte $f
  if (-not (Test-Path $p)) { throw "Arquivo ausente: $p" }
}

$Target = "${RemoteUser}@${RemoteHost}"
$RemoteTmp = "/tmp/alleone-scripts-upload"

Write-Host "==> Destino final: ${Target}:${RemoteScriptsDir}"
Write-Host "==> Staging:       ${Target}:${RemoteTmp}"

$tmp = Join-Path $env:TEMP ("alleone-scripts-" + [guid]::NewGuid().ToString("n"))
New-Item -ItemType Directory -Path $tmp | Out-Null
New-Item -ItemType Directory -Path (Join-Path $tmp "lib") | Out-Null

function Copy-AsUnixLf {
  param([string]$Src, [string]$Dst)
  $text = [System.IO.File]::ReadAllText($Src)
  $text = $text -replace "`r`n", "`n" -replace "`r", "`n"
  $utf8NoBom = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllText($Dst, $text, $utf8NoBom)
}

foreach ($f in $LibFiles) {
  Copy-AsUnixLf (Join-Path $LocalDeployScripts $f) (Join-Path $tmp "lib\$f")
}
foreach ($f in $WrapperFiles) {
  Copy-AsUnixLf (Join-Path $LocalSuporte $f) (Join-Path $tmp $f)
}

Write-Host "==> Limpando staging remoto..."
ssh $Target "rm -rf $RemoteTmp && mkdir -p $RemoteTmp/lib"
if ($LASTEXITCODE -ne 0) { throw "ssh falhou ao criar $RemoteTmp (exit $LASTEXITCODE)" }

Write-Host "==> Enviando para /tmp (scp)..."
scp -r "$tmp\*" "${Target}:${RemoteTmp}/"
if ($LASTEXITCODE -ne 0) { throw "scp falhou (exit $LASTEXITCODE)" }

# Comando em UMA linha - evita CRLF do PowerShell here-string no bash remoto
$install = @(
  "set -e",
  "sudo mkdir -p $RemoteScriptsDir/lib",
  "sudo cp -f $RemoteTmp/*.sh $RemoteTmp/README.md $RemoteScriptsDir/",
  "sudo cp -f $RemoteTmp/lib/*.sh $RemoteScriptsDir/lib/",
  "sudo chown -R alleone:alleone $RemoteScriptsDir",
  "sudo chmod +x $RemoteScriptsDir/*.sh $RemoteScriptsDir/lib/*.sh",
  "if [ -d /home/alleone/producao/deploy/scripts ]; then sudo cp -f $RemoteScriptsDir/lib/restart-alleone-prod.sh $RemoteScriptsDir/lib/pos-deploy-alleone.sh /home/alleone/producao/deploy/scripts/; sudo chmod +x /home/alleone/producao/deploy/scripts/restart-alleone-prod.sh /home/alleone/producao/deploy/scripts/pos-deploy-alleone.sh; fi",
  "if [ -d /home/alleone/teste/deploy/scripts ]; then sudo cp -f $RemoteScriptsDir/lib/restart-alleone-teste.sh $RemoteScriptsDir/lib/pos-deploy-alleone-teste.sh /home/alleone/teste/deploy/scripts/; sudo chmod +x /home/alleone/teste/deploy/scripts/restart-alleone-teste.sh /home/alleone/teste/deploy/scripts/pos-deploy-alleone-teste.sh; fi",
  "rm -rf $RemoteTmp",
  "echo --- instalado ---",
  "ls -la $RemoteScriptsDir",
  "ls -la $RemoteScriptsDir/lib"
) -join "; "

Write-Host "==> Instalando em $RemoteScriptsDir (sudo - pode pedir senha)..."
# -t = TTY para sudo pedir senha se precisar
ssh -t $Target $install
if ($LASTEXITCODE -ne 0) { throw "instalacao remota falhou (exit $LASTEXITCODE)" }

Remove-Item -Recurse -Force $tmp

Write-Host ""
Write-Host "OK de verdade. Suporte usa:"
Write-Host "  bash $RemoteScriptsDir/reiniciar-prod.sh"
Write-Host "  bash $RemoteScriptsDir/reiniciar-teste.sh"
Write-Host "  bash $RemoteScriptsDir/atualizar-prod.sh"
Write-Host "  bash $RemoteScriptsDir/atualizar-teste.sh"
