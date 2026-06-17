/**
 * Script standalone — não depende do build Nest nem do ts-node.
 *
 * Uso:
 *   node scripts/suggest-zabbix-group-matches.mjs              # dry-run + relatório
 *   node scripts/suggest-zabbix-group-matches.mjs --apply    # grava sugestões
 *   node scripts/suggest-zabbix-group-matches.mjs --report   # só relatório
 *   node scripts/suggest-zabbix-group-matches.mjs --min-score=0.4
 */
import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env') });

const prisma = new PrismaClient();
const argv = process.argv.slice(2);
const args = new Set(argv);
const shouldApply = args.has('--apply');
const includeValid = args.has('--all');
const reportOnly = args.has('--report');

function parseMinScore() {
  for (const arg of argv) {
    const match = arg.match(/^--min-score=(.+)$/);
    if (match) {
      const value = Number(match[1]);
      if (Number.isFinite(value) && value > 0 && value <= 1) {
        return value;
      }
    }
  }
  return 0.55;
}

const minScore = parseMinScore();

const STOP_WORDS = new Set([
  'ltda',
  'sa',
  'me',
  'eireli',
  'grp',
  'grupo',
  'group',
  'cloud',
  'tec',
  'tecnologia',
]);

function normalizeForMatch(value) {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokenizeForMatch(value) {
  return normalizeForMatch(value)
    .split(/\s+/)
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token));
}

function scoreCompanyToZabbixGroup(companyName, groupName) {
  const companyNorm = normalizeForMatch(companyName);
  const groupNorm = normalizeForMatch(groupName);

  if (!companyNorm || !groupNorm) return 0;
  if (companyNorm === groupNorm) return 1;
  if (groupNorm.includes(companyNorm) || companyNorm.includes(groupNorm)) {
    return 0.95;
  }

  const grpMatch = groupName.trim().match(/^grp[_-](.+)$/i);
  if (grpMatch) {
    const core = normalizeForMatch(grpMatch[1]);
    const companyCompact = companyNorm.replace(/\s+/g, '');
    const coreCompact = core.replace(/\s+/g, '');
    if (
      core &&
      (companyNorm.includes(core) ||
        core.includes(companyNorm) ||
        companyCompact.includes(coreCompact) ||
        coreCompact.includes(companyCompact))
    ) {
      return 0.9;
    }
  }

  const companyTokens = tokenizeForMatch(companyName);
  const groupTokens = tokenizeForMatch(groupName.replace(/^grp[_-]/i, ''));

  if (!companyTokens.length || !groupTokens.length) return 0;

  let matches = 0;
  for (const groupToken of groupTokens) {
    if (
      companyTokens.some(
        (companyToken) =>
          companyToken === groupToken ||
          companyToken.includes(groupToken) ||
          groupToken.includes(companyToken),
      )
    ) {
      matches += 1;
    }
  }

  return matches / Math.max(groupTokens.length, 1);
}

function findBestGroup(companyName, groups) {
  let best = null;
  for (const group of groups) {
    const score = scoreCompanyToZabbixGroup(companyName, group.name);
    if (!best || score > best.score) {
      best = { group, score };
    }
  }
  return best;
}

function buildZabbixGroupSuggestions({
  companies,
  groups,
  minScore: threshold,
  onlyWithoutValidGroup = true,
  assignedGroups = new Set(),
  groupOwners = new Map(),
}) {
  const groupByExact = new Map(
    groups.map((group) => [group.name.toLowerCase(), group]),
  );
  const taken = new Set(assignedGroups);
  const suggestions = [];

  for (const company of companies) {
    const current = company.zabbixGroupName?.trim() || null;
    const currentValid = current && groupByExact.has(current.toLowerCase());
    const hasInvalidGroup = Boolean(current && !currentValid);

    if (onlyWithoutValidGroup && currentValid) {
      if (current) taken.add(current.toLowerCase());
      continue;
    }

    const bestOverall = findBestGroup(company.name, groups);
    if (!bestOverall || bestOverall.score < threshold) {
      continue;
    }

    let best = null;

    for (const group of groups) {
      if (!hasInvalidGroup && taken.has(group.name.toLowerCase())) {
        continue;
      }

      const score = scoreCompanyToZabbixGroup(company.name, group.name);
      if (score < threshold) continue;

      if (!best || score > best.score) {
        best = { group, score };
      }
    }

    if (!best) {
      if (hasInvalidGroup && bestOverall.score >= threshold) {
        best = bestOverall;
      } else {
        continue;
      }
    }

    if (current && current.toLowerCase() === best.group.name.toLowerCase()) {
      taken.add(current.toLowerCase());
      continue;
    }

    const owner = groupOwners.get(best.group.name.toLowerCase());
    const conflict =
      owner && owner.id !== company.id
        ? `grupo já usado por "${owner.name}"`
        : null;

    suggestions.push({
      companyId: company.id,
      companyName: company.name,
      currentGroup: current,
      suggestedGroup: best.group.name,
      suggestedGroupId: best.group.groupid,
      score: Number(best.score.toFixed(3)),
      conflict,
      reason:
        best.score >= 0.9
          ? 'Correspondência forte pelo nome'
          : 'Correspondência parcial pelo nome',
    });

    if (!conflict) {
      taken.add(best.group.name.toLowerCase());
    }
  }

  return suggestions.sort((a, b) => b.score - a.score);
}

async function zabbixRequest(method, params = {}) {
  const url = process.env.ZABBIX_URL?.trim();
  const token = process.env.ZABBIX_TOKEN?.trim();

  if (!url) throw new Error('ZABBIX_URL não definida no .env');
  if (!token) throw new Error('ZABBIX_TOKEN não definido no .env');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method,
      params,
      id: 1,
    }),
  });

  const data = await response.json();
  if (data.error) {
    throw new Error(data.error.data || data.error.message || 'Erro no Zabbix');
  }

  return data.result;
}

async function getZabbixGroupsFromDb() {
  try {
    const rows = await prisma.$queryRaw`
      SELECT groupid, name
      FROM zabbix.host_groups
      WHERE name IS NOT NULL AND TRIM(name) <> ''
      ORDER BY name ASC
    `;
    return rows
      .map((row) => ({
        groupid: String(row.groupid),
        name: String(row.name).trim(),
      }))
      .filter((row) => row.name.length > 0);
  } catch {
    return [];
  }
}

async function getZabbixGroups() {
  const url = process.env.ZABBIX_URL?.trim();
  const token = process.env.ZABBIX_TOKEN?.trim();

  if (url && token) {
    const groups = await zabbixRequest('hostgroup.get', {
      output: ['groupid', 'name'],
      sortfield: 'name',
    });

    return groups
      .filter((group) => group.name?.trim())
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }

  const dbGroups = await getZabbixGroupsFromDb();
  if (dbGroups.length) {
    return dbGroups;
  }

  throw new Error(
    'Zabbix indisponível: configure ZABBIX_URL/ZABBIX_TOKEN ou mantenha o sync zabbix ativo.',
  );
}

function resolveGroupByName(groups, input) {
  const trimmed = input.trim();
  if (!trimmed) return { exists: false, name: null };

  const exact = groups.find((group) => group.name === trimmed);
  if (exact) return { exists: true, name: exact.name };

  const insensitive = groups.find(
    (group) => group.name.toLowerCase() === trimmed.toLowerCase(),
  );
  if (insensitive) return { exists: true, name: insensitive.name };

  return { exists: false, name: null };
}

async function validateUniqueZabbixGroup(zabbixGroupName, ignoreId) {
  const existing = await prisma.company.findFirst({
    where: {
      zabbixGroupName,
      deletedAt: null,
      ...(ignoreId ? { id: { not: ignoreId } } : {}),
    },
    select: { id: true, name: true },
  });

  if (existing) {
    throw new Error(
      `Grupo já vinculado à empresa "${existing.name}" (${existing.id})`,
    );
  }
}

function printReport({ companies, groups, groupByExact, groupOwners }) {
  const valid = [];
  const invalid = [];
  const empty = [];

  for (const company of companies) {
    const current = company.zabbixGroupName?.trim() || null;
    if (!current) {
      empty.push(company);
      continue;
    }
    if (groupByExact.has(current.toLowerCase())) {
      valid.push({ ...company, current });
    } else {
      invalid.push({ ...company, current });
    }
  }

  const usedGroups = new Set(
    valid.map((row) => row.current.toLowerCase()),
  );
  const freeGroups = groups.filter(
    (group) => !usedGroups.has(group.name.toLowerCase()),
  );

  const duplicates = new Map();
  for (const row of valid) {
    const key = row.current.toLowerCase();
    if (!duplicates.has(key)) duplicates.set(key, []);
    duplicates.get(key).push(row.name);
  }
  const duplicateGroups = [...duplicates.entries()].filter(
    ([, names]) => names.length > 1,
  );

  console.log('─── Relatório ───');
  console.log(`Empresas no portal:        ${companies.length}`);
  console.log(
    `Grupos no Zabbix (sync):   ${groups.length}  ← hosts monitorados, não é qtd. de empresas`,
  );
  console.log(`Com grupo válido:          ${valid.length}`);
  console.log(`Com grupo inválido:        ${invalid.length}`);
  console.log(`Sem grupo:                 ${empty.length}`);
  console.log(`Grupos livres (sem uso):   ${freeGroups.length}`);
  console.log(`Score mínimo:              ${minScore}`);
  console.log('');

  if (duplicateGroups.length) {
    console.log('⚠ Grupos repetidos em mais de uma empresa:');
    for (const [group, names] of duplicateGroups) {
      console.log(`  ${groupByExact.get(group)} → ${names.join(', ')}`);
    }
    console.log('');
  }

  if (invalid.length) {
    console.log('Empresas com grupo que NÃO existe no Zabbix:');
    for (const row of invalid) {
      const best = findBestGroup(row.name, groups);
      const hint = best
        ? `melhor candidato: ${best.group.name} (score ${best.score.toFixed(3)})`
        : 'sem candidato automático';
      console.log(`  • ${row.name}`);
      console.log(`      gravado: ${row.current}`);
      console.log(`      ${hint}`);
    }
    console.log('');
  }

  if (empty.length) {
    console.log(`Empresas sem grupo (${empty.length}):`);
    const preview = empty.slice(0, 15);
    for (const row of preview) {
      const best = findBestGroup(row.name, groups);
      const hint = best
        ? `→ ${best.group.name} (${best.score.toFixed(3)})`
        : 'sem match';
      console.log(`  • ${row.name}  ${hint}`);
    }
    if (empty.length > 15) {
      console.log(`  ... e mais ${empty.length - 15}`);
    }
    console.log('');
  }

  if (freeGroups.length) {
    console.log('Grupos Zabbix sem empresa vinculada:');
    for (const group of freeGroups) {
      console.log(`  • ${group.name}`);
    }
    console.log('');
  }

  if (
    freeGroups.length === 0 &&
    empty.length + invalid.length > 0
  ) {
    console.log(
      'ℹ Todos os 25 grupos já estão ligados a alguma empresa. Empresas extras precisam de vínculo manual ou não têm infra no Zabbix.',
    );
    console.log('');
  }
}

async function main() {
  const [companies, groups] = await Promise.all([
    prisma.company.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, zabbixGroupName: true },
      orderBy: { name: 'asc' },
    }),
    getZabbixGroups(),
  ]);

  const groupByExact = new Map(
    groups.map((group) => [group.name.toLowerCase(), group.name]),
  );

  const groupOwners = new Map();
  const assignedGroups = new Set();

  for (const company of companies) {
    const current = company.zabbixGroupName?.trim();
    if (current && groupByExact.has(current.toLowerCase())) {
      const key = current.toLowerCase();
      assignedGroups.add(key);
      if (!groupOwners.has(key)) {
        groupOwners.set(key, { id: company.id, name: company.name });
      }
    }
  }

  printReport({ companies, groups, groupByExact, groupOwners });

  if (reportOnly) {
    return;
  }

  const suggestions = buildZabbixGroupSuggestions({
    companies,
    groups,
    minScore,
    onlyWithoutValidGroup: !includeValid,
    assignedGroups,
    groupOwners,
  });

  console.log(`Sugestões automáticas: ${suggestions.length}\n`);

  if (!suggestions.length) {
    console.log(
      'Nenhuma sugestão acima do score mínimo. Tente --min-score=0.4 ou corrija manualmente no portal.',
    );
    return;
  }

  for (const item of suggestions) {
    console.log(
      `- ${item.companyName}\n` +
        `    atual: ${item.currentGroup ?? '—'}\n` +
        `    sugerido: ${item.suggestedGroup} (score ${item.score}, ${item.reason})` +
        (item.conflict ? `\n    ⚠ ${item.conflict}` : ''),
    );
  }

  if (!shouldApply) {
    console.log('\nDry-run. Use --apply para gravar (ignora itens com conflito).');
    return;
  }

  let applied = 0;

  for (const item of suggestions) {
    if (item.conflict) {
      console.log(`  ! ${item.companyName}: ${item.conflict}`);
      continue;
    }

    const resolved = resolveGroupByName(groups, item.suggestedGroup);
    if (!resolved.exists || !resolved.name) {
      console.log(`  ! ${item.companyName}: grupo não existe no Zabbix`);
      continue;
    }

    try {
      await validateUniqueZabbixGroup(resolved.name, item.companyId);
    } catch (error) {
      console.log(`  ! ${item.companyName}: ${error.message}`);
      continue;
    }

    const before = item.currentGroup;
    await prisma.company.update({
      where: { id: item.companyId },
      data: { zabbixGroupName: resolved.name },
    });

    console.log(`  ✓ ${item.companyName}: ${before ?? '—'} → ${resolved.name}`);
    applied += 1;
  }

  console.log(`\nAplicados: ${applied} de ${suggestions.length}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
