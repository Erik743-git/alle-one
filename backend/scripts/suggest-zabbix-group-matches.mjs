/**
 * Script standalone — não depende do build Nest nem do ts-node.
 *
 * Uso:
 *   node scripts/suggest-zabbix-group-matches.mjs
 *   node scripts/suggest-zabbix-group-matches.mjs --apply
 *   node scripts/suggest-zabbix-group-matches.mjs --all
 */
import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';

config();

const prisma = new PrismaClient();
const args = new Set(process.argv.slice(2));
const shouldApply = args.has('--apply');
const includeValid = args.has('--all');

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

function buildZabbixGroupSuggestions({
  companies,
  groups,
  minScore = 0.55,
  onlyWithoutValidGroup = true,
  assignedGroups = new Set(),
}) {
  const groupByExact = new Map(
    groups.map((group) => [group.name.toLowerCase(), group]),
  );
  const taken = new Set(assignedGroups);
  const suggestions = [];

  for (const company of companies) {
    const current = company.zabbixGroupName?.trim() || null;
    const currentValid = current && groupByExact.has(current.toLowerCase());

    if (onlyWithoutValidGroup && currentValid) {
      if (current) taken.add(current.toLowerCase());
      continue;
    }

    let best = null;

    for (const group of groups) {
      if (taken.has(group.name.toLowerCase())) continue;

      const score = scoreCompanyToZabbixGroup(company.name, group.name);
      if (score < minScore) continue;

      if (!best || score > best.score) {
        best = { group, score };
      }
    }

    if (!best) continue;

    if (current && current.toLowerCase() === best.group.name.toLowerCase()) {
      taken.add(current.toLowerCase());
      continue;
    }

    suggestions.push({
      companyId: company.id,
      companyName: company.name,
      currentGroup: current,
      suggestedGroup: best.group.name,
      suggestedGroupId: best.group.groupid,
      score: Number(best.score.toFixed(3)),
      reason:
        best.score >= 0.9
          ? 'Correspondência forte pelo nome'
          : 'Correspondência parcial pelo nome',
    });

    taken.add(best.group.name.toLowerCase());
  }

  return suggestions.sort((a, b) => b.score - a.score);
}

async function zabbixRequest(method, params = {}) {
  const url = process.env.ZABBIX_URL;
  const token = process.env.ZABBIX_TOKEN;

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

async function getZabbixGroups() {
  const groups = await zabbixRequest('hostgroup.get', {
    output: ['groupid', 'name'],
    sortfield: 'name',
  });

  return groups
    .filter((group) => group.name?.trim())
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
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

  const assignedGroups = new Set();
  for (const company of companies) {
    const current = company.zabbixGroupName?.trim();
    if (current && groupByExact.has(current.toLowerCase())) {
      assignedGroups.add(current.toLowerCase());
    }
  }

  const suggestions = buildZabbixGroupSuggestions({
    companies,
    groups,
    onlyWithoutValidGroup: !includeValid,
    assignedGroups,
  });

  console.log(`Grupos no Zabbix: ${groups.length}`);
  console.log(`Sugestões: ${suggestions.length}\n`);

  if (!suggestions.length) {
    return;
  }

  for (const item of suggestions) {
    console.log(
      `- ${item.companyName}\n` +
        `    atual: ${item.currentGroup ?? '—'}\n` +
        `    sugerido: ${item.suggestedGroup} (score ${item.score}, ${item.reason})`,
    );
  }

  if (!shouldApply) {
    console.log('\nDry-run. Use --apply para gravar no banco.');
    return;
  }

  let applied = 0;

  for (const item of suggestions) {
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
