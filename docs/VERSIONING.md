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

## Branches

- **`main`**: linha estável; cada tag `v*` deve apontar para um commit em `main`.
- **Feature branches**: `feat/nome`, `fix/nome`; merge via PR quando o CI estiver verde.

## Relação com CI

O workflow [`ci.yml`](../.github/workflows/ci.yml) valida build em push/PR para `main`. Releases não substituem o CI — rodam em paralelo ao criar a tag.
