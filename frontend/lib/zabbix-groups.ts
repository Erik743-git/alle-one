export function parseZabbixGroupNames(value?: string | null): string[] {
  const seen = new Set<string>();
  const groups: string[] = [];

  for (const item of String(value ?? "").split(";")) {
    const group = item.trim();
    if (!group) continue;

    const key = group.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    groups.push(group);
  }

  return groups;
}

export function serializeZabbixGroupNames(groups: string[]): string {
  return parseZabbixGroupNames(groups.join(";")).join(";");
}
