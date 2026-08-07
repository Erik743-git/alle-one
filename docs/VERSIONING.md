# Versionamento — Alle One

## Versão canônica

| Arquivo | Função |
|---------|--------|
| [`VERSION`](../VERSION) | Versão única do produto (fonte da verdade no repositório) |
| [`CHANGELOG.md`](../CHANGELOG.md) | Histórico legível por release |
| Tags Git `v*` | Marcos publicados no GitHub |

Os `package.json` de `backend/` e `frontend/` espelham a versão do produto para rastreio local; em divergência, prevalece `VERSION`.

## Política (SemVer)

- **MAJOR** (`1.0.0`): quebra de contrato de API, migração obrigatória ou mudança incompatível de permissões/schema.
- **MINOR** (`0.3.0`): funcionalidade nova compatível (módulo, tela, integração, relatório).
- **PATCH** (`0.3.1`): correção de bug, ajuste de UX ou documentação sem nova feature.

Enquanto o produto estiver em **0.x**, APIs e schema podem evoluir com migrações documentadas no changelog.

## Tags e releases no GitHub

| Tag | Commit (resumo) | Conteúdo principal |
|-----|-----------------|-------------------|
| `v0.1.0` | Initial commit | Monorepo, módulos base, CI |
| `v0.2.0` | Dashboard Zabbix + relatório Tipo 4 | Monitoramento, Excel, date picker |
| `v0.3.0` | UX portal + GMUD + selects | Tema claro, Consult, selects pesquisáveis |
| `v0.4.0` | V2 Tickets + Apontamentos empresarial | Tickets admin, apontamento portal, questionamentos |
| `v0.5.0` | GMUD PDF + apontamentos ricos + outbox | GMUD externa no ticket, HE/justificativas, OAuth opcional |
| `v0.6.0` | Pré-tickets Graph + 2FA + cutover UX | E-mail→pré-ticket, TOTP, rendimento mídia, portal canônico |

### Publicar uma nova versão

1. Atualize [`CHANGELOG.md`](../CHANGELOG.md) e [`VERSION`](../VERSION).
2. Alinhe `version` em `backend/package.json` e `frontend/package.json` se desejar.
3. Commit: `chore: release v0.x.y`
4. Crie a tag anotada e envie:

```bash
git tag -a v0.3.0 -m "Release v0.3.0"
git push origin main --tags
```

5. O workflow [`.github/workflows/release.yml`](../.github/workflows/release.yml) cria automaticamente a **GitHub Release** com notas geradas a partir dos commits da tag.

### Recuperar versão em runtime (opcional)

```bash
cat VERSION
git describe --tags --always
```

## Branches e rollback de produção

- **`main`**: linha estável; cada tag `v*` deve apontar para um commit em `main`.
- **Feature branches**: `feat/nome`, `fix/nome`; merge via PR quando o CI estiver verde.
- **Produção em commit antigo:** o histórico Git **não some** ao publicar uma versão nova. Enquanto o commit (ou tag) existir no remoto, você pode **redeployar** aquele SHA/tag a qualquer momento.
- **Recomendação:** antes do deploy da versão nova, marque o commit atual de prod:

```bash
git tag -a prod-before-v0.6.0 <sha-atual-de-prod> -m "Prod antes de v0.6.0"
git push origin prod-before-v0.6.0
```

Para voltar: faça deploy desse tag/SHA (sem `git push --force` em `main` a menos que saiba o impacto).

## Relação com CI

O workflow [`ci.yml`](../.github/workflows/ci.yml) valida build em push/PR para `main`. Releases não substituem o CI — rodam em paralelo ao criar a tag.
