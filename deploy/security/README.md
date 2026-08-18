# OWASP ZAP — baseline no ambiente de teste

Scan **passivo** (spider + regras passivas) contra `https://alleone-teste.alletecnologia.com`.

Não rode contra produção. Não use full scan autenticado no primeiro passe (throttle de login ~10/min).

## Pré-requisito

[Docker Desktop](https://docs.docker.com/desktop/) (imagem `ghcr.io/zaproxy/zaproxy:stable`).

## Windows (PowerShell, raiz do repo)

```powershell
.\deploy\security\zap-baseline.ps1
```

Outra URL de homologação (ainda assim **não** prod):

```powershell
.\deploy\security\zap-baseline.ps1 -Target "https://alleone-teste.alletecnologia.com"
```

## Linux (VM)

```bash
bash deploy/security/zap-baseline.sh
```

## Relatório

`deploy/security/out/zap-report.html` (pasta ignorada no Git).

Exit codes do `zap-baseline.py`: `0` ok, `1` warnings, `2` high. O script local usa `-I` na primeira execução para **não falhar o processo** só por warning — leia o HTML.

## O que costuma aparecer (informativo)

| Alerta | Como tratar |
|--------|-------------|
| CSP / headers ausentes | Nginx: snippets `deploy/nginx-alleone-security-headers.snippet.conf` + CSP html/api; Helmet na API; `poweredByHeader: false` no Next |
| `script-src` / `style-src unsafe-inline` nas páginas | Esperado (RSC do Next, React, `next/font`). API não usa. Próximo passo: nonce no middleware |
| Cookie sem `Secure`/`HttpOnly` | Só aceitável em HTTP local; em HTTPS deve estar ok |
| Timestamp / versão em headers | Ruído se o servidor expõe stack |
| Formulário de login | Esperado; não é falha por si |

## O que **não** fazer

- Full scan (`zap-full-scan.py`) em prod
- Brute force em `/api/auth/login`
- Spider autenticado sem conta de teste dedicada
- Commitar o HTML do relatório (pode ter URLs/sessão)
