# Alle One — scripts de suporte (pasta ESTÁVEL na VM)

Pasta na VM (fora do git, não some no pull):

```text
/home/alleone/scripts/
  reiniciar-prod.sh
  reiniciar-teste.sh
  atualizar-prod.sh      # opcional — pull+build+restart
  atualizar-teste.sh
  lib/                   # scripts reais
  README.md
```

## O que o suporte roda

```bash
# Site de produção caiu:
bash /home/alleone/scripts/reiniciar-prod.sh

# Ambiente de teste caiu:
bash /home/alleone/scripts/reiniciar-teste.sh
```

## Enviar / atualizar do PC (Windows PowerShell)

Na pasta do repo:

```powershell
.\deploy\scripts\enviar-scripts-suporte.ps1 -RemoteUser ubuntu -RemoteHost SEU_IP_OU_HOST
```

Exemplo:

```powershell
.\deploy\scripts\enviar-scripts-suporte.ps1 -RemoteUser ubuntu -RemoteHost 169.46.167.198
```

Se o usuário SSH for outro (ex. `alleone`):

```powershell
.\deploy\scripts\enviar-scripts-suporte.ps1 -RemoteUser alleone -RemoteHost SEU_HOST
```

O script cria `/home/alleone/scripts`, envia os arquivos, corrige fim de linha (CRLF→LF) e dá `chmod +x`.
