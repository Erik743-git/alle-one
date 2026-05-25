export const DESK_CATEGORY_KEYS = [
  'Infraestrutura',
  'Sistema',
  'NOC',
  'Rotinas',
  'Consult',
] as const;

export type DeskCategory = (typeof DESK_CATEGORY_KEYS)[number];

export type MonthlyDeskBreakdownRow = {
  monthKey: string;
  monthLabel: string;
  Infraestrutura: number;
  Sistema: number;
  NOC: number;
  Rotinas: number;
  Consult: number;
  Total: number;
};

export function emptyDeskCategoryCounts(): Record<DeskCategory, number> {
  return {
    Infraestrutura: 0,
    Sistema: 0,
    NOC: 0,
    Rotinas: 0,
    Consult: 0,
  };
}

export function categorizeTicketByDesk(
  ticket: Record<string, unknown>,
): DeskCategory {
  const deskName =
    typeof ticket.desk === 'object' && ticket.desk && 'name' in ticket.desk
      ? String((ticket.desk as { name?: unknown }).name ?? '')
      : '';

  const title = String(ticket.title ?? '');
  const deskLower = deskName.toLowerCase();
  const searchBase = `${deskName} ${title}`.toLowerCase();

  if (
    deskLower.includes('consult') ||
    searchBase.includes('mesa consult') ||
    /\bconsult\b/.test(searchBase)
  ) {
    return 'Consult';
  }

  if (
    searchBase.includes('infra') ||
    searchBase.includes('infraestrutura') ||
    searchBase.includes('network') ||
    searchBase.includes('rede')
  ) {
    return 'Infraestrutura';
  }

  if (searchBase.includes('noc')) {
    return 'NOC';
  }

  if (
    searchBase.includes('rotina') ||
    searchBase.includes('routine') ||
    searchBase.includes('runbook')
  ) {
    return 'Rotinas';
  }

  return 'Sistema';
}
