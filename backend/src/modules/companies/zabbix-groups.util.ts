export function parseZabbixGroupNames(value: string | null | undefined): string[] {
  const seen = new Set<string>();
  const groups: string[] = [];

  for (const item of String(value ?? '').split(';')) {
    const group = item.trim();
    if (!group) continue;

    const key = group.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    groups.push(group);
  }

  return groups;
}

export function serializeZabbixGroupNames(
  value: string | null | undefined,
): string | null {
  const groups = parseZabbixGroupNames(value);
  return groups.length ? groups.join(';') : null;
}

export function firstZabbixGroupName(value: string | null | undefined): string | null {
  return parseZabbixGroupNames(value)[0] ?? null;
}

export function zabbixGroupListIncludes(
  value: string | null | undefined,
  groupName: string,
): boolean {
  const normalized = groupName.trim().toLowerCase();
  if (!normalized) return false;
  return parseZabbixGroupNames(value).some(
    (group) => group.toLowerCase() === normalized,
  );
}
