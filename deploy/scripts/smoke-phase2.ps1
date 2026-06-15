# Smoke test local - Fase 2 (health, reconcile, outbox)
# Uso:
#   $env:ALLEONE_SMOKE_EMAIL = "admin@exemplo.com"
#   $env:ALLEONE_SMOKE_PASSWORD = "sua-senha"
#   .\deploy\scripts\smoke-phase2.ps1
#
# Sem login (so endpoints publicos):
#   .\deploy\scripts\smoke-phase2.ps1 -SkipAuth

param(
  [string]$ApiBase = "http://localhost:3002",
  [string]$Email = $env:ALLEONE_SMOKE_EMAIL,
  [string]$Password = $env:ALLEONE_SMOKE_PASSWORD,
  [switch]$SkipAuth,
  [switch]$RetryReconcile
)

if ($env:ALLEONE_API_URL) {
  $ApiBase = $env:ALLEONE_API_URL
}

$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Message)
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Pass {
  param([string]$Message)
  Write-Host "OK  $Message" -ForegroundColor Green
}

function Write-WarnLine {
  param([string]$Message)
  Write-Host "!!  $Message" -ForegroundColor Yellow
}

function Write-Fail {
  param([string]$Message)
  Write-Host "FAIL $Message" -ForegroundColor Red
}

$failed = $false

Write-Step "API base: $ApiBase"

try {
  $health = Invoke-RestMethod -Uri "$ApiBase/health" -Method GET
  if ($health.ok -and $health.database -eq "up") {
    Write-Pass "GET /health - banco up"
  }
  else {
    Write-Fail "GET /health - resposta inesperada"
    $failed = $true
  }
}
catch {
  Write-Fail "GET /health - $($_.Exception.Message)"
  $failed = $true
}

try {
  $integrations = Invoke-RestMethod -Uri "$ApiBase/health/integrations" -Method GET
  $sync = $integrations.tifluxSync
  $outbox = $integrations.outbox
  Write-Pass "GET /health/integrations"
  Write-Host "    tifluxSync.status = $($sync.status)"
  if ($sync.lastTicketUpdate) {
    Write-Host "    lastTicketUpdate  = $($sync.lastTicketUpdate)"
  }
  if ($sync.message) {
    Write-Host "    message           = $($sync.message)"
  }
  Write-Host "    outbox.pending    = $($outbox.pending)"
  Write-Host "    outbox.failed     = $($outbox.failed)"

  if ($sync.status -eq "stale") {
    Write-WarnLine "Sync TiFlux possivelmente parado (verifique alleone-tiflux-sync)"
  }
  if ($outbox.failed -gt 0) {
    Write-WarnLine "Outbox com $($outbox.failed) item(ns) FAILED - rode reconcile com retry"
  }
}
catch {
  Write-Fail "GET /health/integrations - $($_.Exception.Message)"
  $failed = $true
}

if ($SkipAuth) {
  Write-WarnLine "SkipAuth - pulando login, reconcile e reprocess"
}
elseif ((-not $Email) -or (-not $Password)) {
  Write-WarnLine "Defina ALLEONE_SMOKE_EMAIL e ALLEONE_SMOKE_PASSWORD para rotas autenticadas"
}
else {
  $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession

  Write-Step "Login POST /auth/login ($Email)"
  try {
    $loginBody = @{ email = $Email; password = $Password } | ConvertTo-Json
    $null = Invoke-WebRequest `
      -Uri "$ApiBase/auth/login" `
      -Method POST `
      -Body $loginBody `
      -ContentType "application/json; charset=utf-8" `
      -WebSession $session

    $cookie = $session.Cookies.GetCookies($ApiBase) | Where-Object { $_.Name -eq "alleone_access" }
    if ($cookie) {
      Write-Pass "Cookie alleone_access recebido"
    }
    else {
      Write-WarnLine "Login OK mas cookie alleone_access nao encontrado (verifique AUTH_COOKIE_* no .env)"
    }
  }
  catch {
    Write-Fail "Login - $($_.Exception.Message)"
    $failed = $true
    $session = $null
  }

  if ($null -ne $session) {
    $reconcileUrl = "$ApiBase/tickets/reconcile"
    if ($RetryReconcile) {
      $reconcileUrl = "$reconcileUrl" + "?retry=true"
    }

    Write-Step "POST /tickets/reconcile"
    try {
      $reconcile = Invoke-RestMethod -Uri $reconcileUrl -Method POST -WebSession $session
      Write-Pass "Reconcile executado"
      Write-Host "    summary.total = $($reconcile.summary.total)"
      Write-Host "    outboxFailed  = $($reconcile.summary.outboxFailed)"
      Write-Host "    pendingSync   = $($reconcile.summary.appointmentPendingSync)"
      if ($reconcile.retry) {
        Write-Host "    retry.requeued = $($reconcile.retry.requeued)"
        Write-Host "    retry.synced   = $($reconcile.retry.synced)"
      }
      if (($reconcile.summary.total -gt 0) -and ($reconcile.issues.Count -gt 0)) {
        Write-Host "    primeiras issues:"
        $reconcile.issues | Select-Object -First 3 | ForEach-Object {
          $line = "      [$($_.kind)] ticket=$($_.ticketNumber) - $($_.message)"
          Write-Host $line
        }
      }
    }
    catch {
      Write-Fail "Reconcile - $($_.Exception.Message)"
      $failed = $true
    }

    Write-Step "POST /admin/reprocess-tiflux-outbox"
    try {
      $reprocess = Invoke-RestMethod `
        -Uri "$ApiBase/admin/reprocess-tiflux-outbox" `
        -Method POST `
        -WebSession $session
      Write-Pass "Reprocess outbox"
      Write-Host "    requeued  = $($reprocess.requeued)"
      Write-Host "    processed = $($reprocess.processed)"
      Write-Host "    synced    = $($reprocess.synced)"
      Write-Host "    failed    = $($reprocess.failed)"
    }
    catch {
      Write-Fail "Reprocess - $($_.Exception.Message)"
      $failed = $true
    }

    Write-Step "GET /health/integrations (apos reprocess)"
    try {
      $after = Invoke-RestMethod -Uri "$ApiBase/health/integrations" -Method GET
      Write-Host "    outbox.pending = $($after.outbox.pending)"
      Write-Host "    outbox.failed  = $($after.outbox.failed)"
    }
    catch {
      Write-WarnLine "Nao foi possivel reler integrations: $($_.Exception.Message)"
    }
  }
}

Write-Host ""
if ($failed) {
  Write-Fail "Smoke test concluido com falhas"
  exit 1
}

Write-Pass "Smoke test concluido"
exit 0
