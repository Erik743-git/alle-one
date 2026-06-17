/** Normaliza texto para comparação fuzzy (empresa ↔ grupo Zabbix). */
export function normalizeForMatch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

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

export function tokenizeForMatch(value: string): string[] {
  return normalizeForMatch(value)
    .split(/\s+/)
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token));
}

/** Pontuação 0–1 entre nome da empresa e nome do grupo Zabbix. */
export function scoreCompanyToZabbixGroup(
  companyName: string,
  groupName: string,
): number {
  const companyNorm = normalizeForMatch(companyName);
  const groupNorm = normalizeForMatch(groupName);

  if (!companyNorm || !groupNorm) {
    return 0;
  }

  if (companyNorm === groupNorm) {
    return 1;
  }

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
  const groupTokens = tokenizeForMatch(
    groupName.replace(/^grp[_-]/i, ''),
  );

  if (!companyTokens.length || !groupTokens.length) {
    return 0;
  }

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

export type ZabbixGroupSuggestion = {
  companyId: string;
  companyName: string;
  currentGroup: string | null;
  suggestedGroup: string;
  suggestedGroupId: string;
  score: number;
  reason: string;
};

export function buildZabbixGroupSuggestions(params: {
  companies: Array<{ id: string; name: string; zabbixGroupName: string | null }>;
  groups: Array<{ groupid: string; name: string }>;
  minScore?: number;
  onlyWithoutValidGroup?: boolean;
  assignedGroups?: Set<string>;
}): ZabbixGroupSuggestion[] {
  const minScore = params.minScore ?? 0.55;
  const groupByExact = new Map(
    params.groups.map((group) => [group.name.toLowerCase(), group]),
  );
  const taken = new Set(params.assignedGroups ?? []);
  const suggestions: ZabbixGroupSuggestion[] = [];

  for (const company of params.companies) {
    const current = company.zabbixGroupName?.trim() || null;
    const currentValid =
      current && groupByExact.has(current.toLowerCase());

    if (params.onlyWithoutValidGroup !== false && currentValid) {
      if (current) {
        taken.add(current.toLowerCase());
      }
      continue;
    }

    let best: { group: { groupid: string; name: string }; score: number } | null =
      null;

    for (const group of params.groups) {
      if (taken.has(group.name.toLowerCase())) {
        continue;
      }

      const score = scoreCompanyToZabbixGroup(company.name, group.name);
      if (score < minScore) {
        continue;
      }

      if (!best || score > best.score) {
        best = { group, score };
      }
    }

    if (!best) {
      continue;
    }

    if (
      current &&
      current.toLowerCase() === best.group.name.toLowerCase()
    ) {
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
