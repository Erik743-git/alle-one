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

/** Expressão SQL (PostgreSQL) espelhando `categorizeTicketByDesk` para agregações. */
export function sqlDeskCategoryCase(alias: string): string {
  const desk = `lower(coalesce(${alias}.desk_name, ''))`;
  const base = `lower(coalesce(${alias}.desk_name, '') || ' ' || coalesce(${alias}.title, ''))`;
  return `case
    when ${desk} like '%consult%' or ${base} like '%mesa consult%' or ${base} ~ '\\mconsult\\M' then 'Consult'
    when ${base} like '%infra%' or ${base} like '%infraestrutura%' or ${base} like '%network%' or ${base} like '%rede%' then 'Infraestrutura'
    when ${base} like '%noc%' then 'NOC'
    when ${base} like '%rotina%' or ${base} like '%routine%' or ${base} like '%runbook%' then 'Rotinas'
    else 'Sistema'
  end`;
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
