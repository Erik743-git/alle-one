# Diagnóstico Cloudflare 522 — rode NO SEU PC (Windows)
# Uso: .\deploy\scripts\diagnose-522.ps1
#      .\deploy\scripts\diagnose-522.ps1 -OriginIp 169.46.167.198

param(
    [string]$HostName = "alleone.alletecnologia.com",
    [string]$OriginIp = ""
)

Write-Host "=============================================="
Write-Host " Diagnóstico 522 — AlleOne (seu PC / externo)"
Write-Host " Host: $HostName"
Write-Host "=============================================="
Write-Host ""

Write-Host "=== 1) DNS público ==="
try {
    $dns = Resolve-DnsName -Name $HostName -Type A -ErrorAction Stop
    $ips = $dns | Where-Object { $_.Type -eq 'A' } | ForEach-Object { $_.IPAddress }
    foreach ($ip in $ips) {
        $isCf = $ip -match '^(104\.|172\.6[67]\.)'
        if ($isCf) {
            Write-Host "[INFO] $ip  -> IP da CLOUDFLARE (proxy laranja ativo)" -ForegroundColor Cyan
        } else {
            Write-Host "[OK]   $ip  -> possível IP de ORIGEM (nuvem cinza ou sem proxy)" -ForegroundColor Green
            if (-not $OriginIp) { $OriginIp = $ip }
        }
    }
    if (-not $ips) { Write-Host "[AVISO] Nenhum A record" -ForegroundColor Yellow }
} catch {
    Write-Host "[FALHA] DNS: $_" -ForegroundColor Red
}
Write-Host ""
Write-Host "Se só aparecer IP 104.x / 172.x -> proxy laranja. Veja IP origem no painel Cloudflare DNS."
Write-Host ""

if (-not $OriginIp) {
    $OriginIp = Read-Host "Digite o IP de ORIGEM da VM (IBM Console / diagnose-522.sh na VM)"
}

if (-not $OriginIp) {
    Write-Host "[FALHA] IP de origem obrigatório para testes de porta" -ForegroundColor Red
    exit 1
}

Write-Host "=== 2) Portas no IP de origem: $OriginIp ==="
foreach ($port in @(80, 443)) {
  try {
    $t = Test-NetConnection -ComputerName $OriginIp -Port $port -WarningAction SilentlyContinue
    if ($t.TcpTestSucceeded) {
      Write-Host "[OK]   TCP $port aberta" -ForegroundColor Green
    } else {
      Write-Host "[FALHA] TCP $port fechada ou timeout -> firewall IBM / rede" -ForegroundColor Red
    }
  } catch {
    Write-Host "[FALHA] TCP $port : $_" -ForegroundColor Red
  }
}
Write-Host ""

Write-Host "=== 3) HTTP direto na origem (bypass Cloudflare) ==="
try {
    $uri = "http://${OriginIp}/health"
    $req = [System.Net.HttpWebRequest]::Create($uri)
    $req.Host = $HostName
    $req.Timeout = 10000
    $req.Method = "HEAD"
    $resp = $req.GetResponse()
    Write-Host "[OK]   $($resp.ResponseUri) -> $([int]$resp.StatusCode) $($resp.StatusDescription)" -ForegroundColor Green
    $resp.Close()
} catch [System.Net.WebException] {
    $status = $_.Exception.Response.StatusCode.value__
    if ($status) {
        Write-Host "[INFO] Respondeu HTTP $status (conexão OK, app/nginx ativo)" -ForegroundColor Yellow
    } else {
        Write-Host "[FALHA] Sem resposta HTTP -> porta 80 bloqueada ou IP errado" -ForegroundColor Red
        Write-Host "        $($_.Exception.Message)"
    }
}
Write-Host ""

Write-Host "=== 4) HTTPS via Cloudflare (caminho real do usuário) ==="
try {
    $r = Invoke-WebRequest -Uri "https://${HostName}/health" -Method Head -TimeoutSec 15 -UseBasicParsing
    Write-Host "[OK]   https://${HostName} -> $($r.StatusCode)" -ForegroundColor Green
} catch {
    $msg = $_.Exception.Message
    if ($msg -match '522') {
        Write-Host "[FALHA] Erro 522 — Cloudflare não alcança origem" -ForegroundColor Red
        Write-Host "        Causa provável: IP errado no DNS OU porta 80 bloqueada no IBM"
    } elseif ($msg -match '525|526') {
        Write-Host "[FALHA] Erro SSL origem: $msg" -ForegroundColor Red
    } else {
        Write-Host "[FALHA] $msg" -ForegroundColor Red
    }
}
Write-Host ""

Write-Host "=============================================="
Write-Host " MATRIZ DE CONCLUSÃO"
Write-Host "=============================================="
Write-Host @"

  Porta 80 FECHADA de fora     -> Liberar no IBM (security group / firewall)
  Porta 80 ABERTA + HTTP OK    -> DNS Cloudflare: A = $OriginIp
  HTTP origem OK + 522 no CF   -> IP errado no painel CF ou proxy/SSL
  DNS só IPs 104/172           -> Normal com proxy; confira 'Conteúdo' no painel

"@
