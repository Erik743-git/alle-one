# Alle One — cria banco alleone_teste (copia do alleone local ou de um dump .sql/.sql.gz)
#
# Pré-requisitos:
#   - Docker Desktop rodando
#   - Container postgres do backend (docker compose up -d postgres)
#
# Exemplos:
#   # 1) Clonar o banco local alleone → alleone_teste
#   .\deploy\scripts\setup-db-teste.ps1
#
#   # 2) Restaurar um dump de produção baixado do servidor
#   .\deploy\scripts\setup-db-teste.ps1 -DumpFile C:\backups\alleone_20260724.sql.gz
#
#   # 3) Só subir Postgres + criar .env.teste (sem copiar dados)
#   .\deploy\scripts\setup-db-teste.ps1 -SkipClone
#
# Dump em produção (no servidor, NÃO roda aqui):
#   pg_dump "$DATABASE_URL" | gzip -9 > /tmp/alleone_prod.sql.gz
#   # depois baixe o arquivo para a máquina local e use -DumpFile

param(
  [string]$SourceDb = "alleone",
  [string]$TargetDb = "alleone_teste",
  [string]$DumpFile = "",
  [string]$PgUser = "alle",
  [string]$PgPassword = "alle123",
  [string]$Container = "alleone_postgres",
  [switch]$SkipClone,
  [switch]$ForceRecreate
)

$ErrorActionPreference = "Stop"
$Root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
if (-not (Test-Path (Join-Path $Root "backend\docker-compose.yml"))) {
  $Root = "C:\PortalAlle\alle-one"
}
$BackendDir = Join-Path $Root "backend"
$EnvSource = Join-Path $BackendDir ".env"
$EnvTeste = Join-Path $BackendDir ".env.teste"

function Write-Step([string]$Message) {
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Assert-Docker {
  docker info 1>$null 2>$null
  if ($LASTEXITCODE -ne 0) {
    throw "Docker Desktop nao esta pronto. Abra o Docker Desktop, aguarde ficar verde e rode de novo."
  }
}

function Ensure-Postgres {
  Write-Step "Subindo container Postgres"
  Push-Location $BackendDir
  try {
    docker compose up -d postgres
    if ($LASTEXITCODE -ne 0) { throw "Falha ao subir postgres via docker compose" }
  } finally {
    Pop-Location
  }

  Write-Step "Aguardando Postgres aceitar conexoes"
  for ($i = 1; $i -le 40; $i++) {
    docker exec $Container pg_isready -U $PgUser 1>$null 2>$null
    if ($LASTEXITCODE -eq 0) {
      Write-Host "Postgres pronto"
      return
    }
    Start-Sleep -Seconds 2
  }
  throw "Postgres nao ficou pronto a tempo (container: $Container)"
}

function Invoke-Psql([string]$Database, [string]$Sql) {
  docker exec -e PGPASSWORD=$PgPassword $Container `
    psql -U $PgUser -d $Database -v ON_ERROR_STOP=1 -c $Sql
  if ($LASTEXITCODE -ne 0) { throw "psql falhou: $Sql" }
}

function Ensure-TargetDb {
  Write-Step "Garantindo banco '$TargetDb'"
  $exists = docker exec -e PGPASSWORD=$PgPassword $Container `
    psql -U $PgUser -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$TargetDb'"
  if ($LASTEXITCODE -ne 0) { throw "Nao foi possivel listar bancos" }

  if (($exists -as [string]).Trim() -eq "1") {
    if ($ForceRecreate) {
      Write-Host "Recriando $TargetDb (-ForceRecreate)"
      Invoke-Psql "postgres" "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$TargetDb' AND pid <> pg_backend_pid();"
      Invoke-Psql "postgres" "DROP DATABASE $TargetDb;"
    } else {
      Write-Host "Banco $TargetDb ja existe (use -ForceRecreate para dropar e recriar)"
      return
    }
  }

  Invoke-Psql "postgres" "CREATE DATABASE $TargetDb OWNER $PgUser;"
}

function Clone-FromLocalSource {
  Write-Step "Clonando '$SourceDb' → '$TargetDb' (pg_dump | psql)"
  $srcExists = docker exec -e PGPASSWORD=$PgPassword $Container `
    psql -U $PgUser -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$SourceDb'"
  if (($srcExists -as [string]).Trim() -ne "1") {
    throw "Banco origem '$SourceDb' nao existe no container. Use -DumpFile com um backup de producao."
  }

  # Termina conexoes no destino antes do restore
  Invoke-Psql "postgres" "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$TargetDb' AND pid <> pg_backend_pid();"

  docker exec -e PGPASSWORD=$PgPassword $Container `
    bash -lc "pg_dump -U $PgUser -d $SourceDb --no-owner --no-acl | psql -U $PgUser -d $TargetDb -v ON_ERROR_STOP=1"
  if ($LASTEXITCODE -ne 0) { throw "Clone pg_dump/psql falhou" }
}

function Restore-FromDump {
  param([string]$Path)

  if (-not (Test-Path $Path)) {
    throw "Dump nao encontrado: $Path"
  }

  Write-Step "Restaurando dump → '$TargetDb'"
  $name = Split-Path $Path -Leaf
  $remote = "/tmp/$name"
  docker cp $Path "${Container}:$remote"
  if ($LASTEXITCODE -ne 0) { throw "docker cp falhou" }

  Invoke-Psql "postgres" "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$TargetDb' AND pid <> pg_backend_pid();"

  if ($name -like "*.gz") {
    docker exec -e PGPASSWORD=$PgPassword $Container `
      bash -lc "gunzip -c '$remote' | psql -U $PgUser -d $TargetDb -v ON_ERROR_STOP=1"
  } else {
    docker exec -e PGPASSWORD=$PgPassword $Container `
      bash -lc "psql -U $PgUser -d $TargetDb -v ON_ERROR_STOP=1 -f '$remote'"
  }
  if ($LASTEXITCODE -ne 0) { throw "Restore do dump falhou" }

  docker exec $Container rm -f $remote 1>$null 2>$null
}

function Write-EnvTeste {
  Write-Step "Gerando backend/.env.teste"
  if (-not (Test-Path $EnvSource)) {
    throw ".env nao encontrado em $EnvSource - copie de .env.example e preencha antes."
  }

  $lines = Get-Content $EnvSource -Encoding UTF8
  $out = foreach ($line in $lines) {
    if ($line -match '^\s*DATABASE_URL\s*=') {
      'DATABASE_URL="postgresql://alle:alle123@localhost:5432/alleone_teste?schema=public"'
    } else {
      $line
    }
  }
  Set-Content -Path $EnvTeste -Value $out -Encoding UTF8
  Write-Host "Criado: $EnvTeste"
  Write-Host "DATABASE_URL aponta para banco $TargetDb"
}

Write-Step "Alle One — setup base de teste"
Assert-Docker
Ensure-Postgres
Ensure-TargetDb

if (-not $SkipClone) {
  # Se o banco ja existia e nao recriamos, ainda assim podemos querer re-clonar.
  # Com -ForceRecreate o banco esta vazio; sem force, clone sobrescreve objetos.
  if ($DumpFile) {
    if (-not $ForceRecreate) {
      Write-Host "Dica: para restore limpo de dump, prefira -ForceRecreate" -ForegroundColor Yellow
    }
    Restore-FromDump -Path $DumpFile
  } else {
    Clone-FromLocalSource
  }
} else {
  Write-Host "SkipClone: banco criado/mantido sem copiar dados"
}

Write-EnvTeste

Write-Host ""
Write-Host "Pronto." -ForegroundColor Green
Write-Host "Para rodar a API na base de teste:"
Write-Host "  cd backend"
Write-Host "  Copy-Item .env.teste .env -Force   # ou use dotenv -e .env.teste"
Write-Host "  npx prisma migrate deploy"
Write-Host "  npm run start:dev"
Write-Host ""
Write-Host "IMPORTANTE: nao aponte producao para alleone_teste. Desenvolva so nessa base."
