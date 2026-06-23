# Diagnostico Cloudflare 522 — rode NO SEU PC (Windows)
# Uso: .\deploy\scripts\diagnose-522.ps1
#      .\deploy\scripts\diagnose-522.ps1 -OriginIp 169.46.167.198

param(
    [string]$HostName = "alleone.alletecnologia.com",
    [string]$OriginIp = ""
)

function Log-Info($msg)  { Write-Host $msg -ForegroundColor Cyan }
function Log-Ok($msg)    { Write-Host $msg -ForegroundColor Green }
function Log-Warn($msg)  { Write-Host $msg -ForegroundColor Yellow }
function Log-Fail($msg)  { Write-Host $msg -ForegroundColor Red }

Write-Host "=============================================="
Write-Host " Diagnostico 522 - AlleOne (seu PC / externo)"
Write-Host " Host: $HostName"
Write-Host "=============================================="
Write-Host ""

Write-Host "=== 1. DNS publico ==="
try {
    $dns = Resolve-DnsName -Name $HostName -Type A -ErrorAction Stop
    $ips = @($dns | Where-Object { $_.Type -eq 'A' } | ForEach-Object { $_.IPAddress })
    foreach ($ip in $ips) {
        $isCf = $ip -match '^(104\.|172\.6[67]\.)'
        if ($isCf) {
            Log-Info "INFO: $ip -> IP da CLOUDFLARE (proxy laranja ativo)"
        } else {
            Log-Ok "OK: $ip -> possivel IP de ORIGEM (nuvem cinza ou sem proxy)"
            if (-not $OriginIp) { $OriginIp = $ip }
        }
    }
    if ($ips.Count -eq 0) { Log-Warn "AVISO: Nenhum A record" }
} catch {
    Log-Fail "FALHA DNS: $_"
}
Write-Host ""
Write-Host "Se so aparecer IP 104.x / 172.x -> proxy laranja. Veja IP origem no painel Cloudflare DNS."
Write-Host ""

if (-not $OriginIp) {
    $OriginIp = Read-Host "Digite o IP de ORIGEM da VM (IBM Console / diagnose-522.sh na VM)"
}

if (-not $OriginIp) {
    Log-Fail "FALHA: IP de origem obrigatorio para testes de porta"
    exit 1
}

Write-Host "=== 2. Portas no IP de origem: $OriginIp ==="
foreach ($port in @(80, 443)) {
    try {
        $t = Test-NetConnection -ComputerName $OriginIp -Port $port -WarningAction SilentlyContinue
        if ($t.TcpTestSucceeded) {
            Log-Ok "OK: TCP $port aberta"
        } else {
            Log-Fail "FALHA: TCP $port fechada ou timeout -> firewall IBM / rede"
        }
    } catch {
        Log-Fail "FALHA TCP $port : $_"
    }
}
Write-Host ""

Write-Host "=== 3. HTTP direto na origem (bypass Cloudflare) ==="
try {
    $uri = "http://${OriginIp}/health"
    $req = [System.Net.HttpWebRequest]::Create($uri)
    $req.Host = $HostName
    $req.Timeout = 10000
    $req.Method = "HEAD"
    $resp = $req.GetResponse()
    $code = [int]$resp.StatusCode
    Log-Ok "OK: $uri -> $code $($resp.StatusDescription)"
    $resp.Close()
} catch [System.Net.WebException] {
    $status = $null
    if ($_.Exception.Response) {
        $status = [int]$_.Exception.Response.StatusCode
    }
    if ($status) {
        Log-Warn "INFO: Respondeu HTTP $status (conexao OK, app/nginx ativo)"
    } else {
        Log-Fail "FALHA: Sem resposta HTTP -> porta 80 bloqueada ou IP errado"
        Write-Host "       $($_.Exception.Message)"
    }
}
Write-Host ""

Write-Host "=== 4. HTTPS via Cloudflare (caminho real do usuario) ==="
try {
    $r = Invoke-WebRequest -Uri "https://${HostName}/health" -Method Head -TimeoutSec 15 -UseBasicParsing
    Log-Ok "OK: https://${HostName} -> $($r.StatusCode)"
} catch {
    $msg = $_.Exception.Message
    if ($msg -match '522') {
        Log-Fail "FALHA: Erro 522 - Cloudflare nao alcanca origem"
        Write-Host "       Causa provavel: IP errado no DNS OU porta 80 bloqueada no IBM"
    } elseif ($msg -match '525|526') {
        Log-Fail "FALHA: Erro SSL origem: $msg"
    } else {
        Log-Fail "FALHA: $msg"
    }
}
Write-Host ""

Write-Host "=============================================="
Write-Host " MATRIZ DE CONCLUSAO"
Write-Host "=============================================="
Write-Host ""
Write-Host "  Porta 80 FECHADA de fora     -> Liberar no IBM (security group / firewall)"
Write-Host "  Porta 80 ABERTA + HTTP OK    -> DNS Cloudflare: A = $OriginIp"
Write-Host "  HTTP origem OK + 522 no CF   -> IP errado no painel CF ou proxy/SSL"
Write-Host "  DNS so IPs 104/172           -> Normal com proxy; confira Conteudo no painel"
Write-Host ""
