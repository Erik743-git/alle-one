# Deploy portal cliente v3 → ambiente de TESTE

## Antes (local)

1. Código commitado e no remoto (`git push` na branch da feature).
2. VM de teste com repo em `/home/alleone/teste` apontando para a mesma branch (ou `main` após merge).

## Por que o pack não aparecia no localhost

O código **já estava** no `start:dev` (não commitado ainda), mas:

- Pack só aparece ao **editar** uma empresa (Admin → Empresas → lápis/editar), seção **“Módulos contratados (portal do cliente)”**.
- Faça hard refresh (`Ctrl+Shift+R`) após o front subir.
- Banco local já tem `company_modules` (backfill no migrate).

Backend local: `http://127.0.0.1:3002/health` → `ok`.

## Segurança (checklist pré-teste)

| Ponto | Status |
|-------|--------|
| `POST /auth/switch-company` só CLIENT_* + membership real | OK (403 staff) |
| Switch incrementa `tokenVersion` (invalida JWT antigo) | OK |
| Pack / memberships: só ADMIN (`@Roles('ADMIN')`) | OK |
| Escopo tickets/dashboard CLIENT_* pela empresa ativa | OK |
| Staff Alle ignora pack | OK |
| Sem ACL por mesa | OK |

**Atenção teste:** rode o enum `CLIENT_*` **antes** do migrate (o script de deploy já faz isso).

## Na VM (usuário `alleone`)

```bash
cd /home/alleone/teste
git fetch origin
git checkout feat/cutover-tiflux-hardening-20260727
git pull

# Atualiza (pull + enum + migrate + build + pm2)
bash /home/alleone/scripts/atualizar-teste.sh
# ou, se o wrapper ainda não aponta para o script do repo:
bash /home/alleone/teste/deploy/scripts/pos-deploy-alleone-teste.sh
```

Se o script em `/home/alleone/scripts` estiver desatualizado:

```bash
# do PC (PowerShell), na raiz do repo:
.\deploy\scripts\enviar-scripts-suporte.ps1 -RemoteUser alleone -RemoteHost SEU_HOST
```

## Smoke rápido pós-deploy

1. Admin → Empresas → editar → ver/salvar pack  
2. Usuários: papel Cliente (gestor) / Cliente (funcionário)  
3. Login gestor: apontamentos = funcionários; financeiro = Alle; dashboard dual  
4. Staff: sem switcher; apontamentos Alle intactos  

Detalhes: `docs/SMOKE_PORTAL_CLIENTE_TENANT.md` · `docs/ROTEIRO_TESTE_PORTAL_CLIENTE_V3_LOCAL.md`
