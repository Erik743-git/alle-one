export type TicketStageGroupKey =
  | 'pendente'
  | 'aguardando'
  | 'execucao'
  | 'outros';

export type TicketStageGroupDef = {
  key: TicketStageGroupKey;
  label: string;
  order: number;
};

export const TICKET_STAGE_GROUPS: TicketStageGroupDef[] = [
  { key: 'pendente', label: 'Pendente', order: 1 },
  { key: 'aguardando', label: 'Aguardando usuário', order: 2 },
  { key: 'execucao', label: 'Em execução', order: 3 },
  { key: 'outros', label: 'Outros estágios', order: 4 },
];

/** Normaliza texto para comparação (caixa, acentos, espaços). */
export function normalizeStageKey(
  stageName: string | null | undefined,
): string {
  return String(stageName ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ');
}

/**
 * Label canônico para persistência/UI (unifica casing e aliases EN/PT).
 * Ex.: "Em Execução" → "Em execução"; "Pending" → "Pendente".
 */
export function canonicalizeStageName(
  stageName: string | null | undefined,
): string | null {
  if (stageName == null) return null;
  const trimmed = String(stageName).trim();
  if (!trimmed) return null;

  const key = resolveTicketStageGroup(trimmed);
  if (key === 'pendente') return 'Pendente';
  if (key === 'aguardando') return 'Aguardando usuário';
  if (key === 'execucao') return 'Em execução';
  return trimmed;
}

export function resolveTicketStageGroup(
  stageName: string | null | undefined,
): TicketStageGroupKey {
  const normalized = normalizeStageKey(stageName);

  if (!normalized) return 'outros';
  // EN + PT: Pending / Pendente
  if (normalized.includes('pendente') || normalized === 'pending') {
    return 'pendente';
  }
  if (normalized.includes('aguardando') || normalized.includes('waiting')) {
    return 'aguardando';
  }
  // Em execução / Em Execução / In progress
  // Também "Em execu??o" (UTF-8 corrompido em dumps/clones).
  if (
    normalized.includes('execuc') ||
    normalized.includes('execut') ||
    normalized.includes('in progress') ||
    normalized === 'progress' ||
    /^em execu/.test(normalized)
  ) {
    return 'execucao';
  }
  return 'outros';
}
