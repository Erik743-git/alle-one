import {
  PORTAL_STAGE,
  mapLegacyStageToPortal,
  normalizeStageCompareKey,
} from './portal-ticket-stages';

export type TicketStageGroupKey =
  | 'novo'
  | 'atendimento'
  | 'aguardando'
  | 'resolvido'
  | 'encerrado'
  | 'outros';

export type TicketStageGroupDef = {
  key: TicketStageGroupKey;
  label: string;
  order: number;
};

export const TICKET_STAGE_GROUPS: TicketStageGroupDef[] = [
  { key: 'novo', label: PORTAL_STAGE.NOVO, order: 1 },
  { key: 'atendimento', label: PORTAL_STAGE.EM_ATENDIMENTO, order: 2 },
  { key: 'aguardando', label: PORTAL_STAGE.AGUARDANDO_CLIENTE, order: 3 },
  { key: 'resolvido', label: PORTAL_STAGE.RESOLVIDO, order: 4 },
  { key: 'encerrado', label: PORTAL_STAGE.ENCERRADO, order: 5 },
  { key: 'outros', label: 'Outros estágios', order: 6 },
];

/** Normaliza texto para comparação (caixa, acentos, espaços). */
export function normalizeStageKey(
  stageName: string | null | undefined,
): string {
  return normalizeStageCompareKey(String(stageName ?? ''));
}

/**
 * Label canônico para persistência/UI.
 */
export function canonicalizeStageName(
  stageName: string | null | undefined,
): string | null {
  return mapLegacyStageToPortal(stageName);
}

export function resolveTicketStageGroup(
  stageName: string | null | undefined,
): TicketStageGroupKey {
  const mapped = mapLegacyStageToPortal(stageName);
  if (!mapped) return 'outros';
  if (mapped === PORTAL_STAGE.NOVO) return 'novo';
  if (mapped === PORTAL_STAGE.EM_ATENDIMENTO) return 'atendimento';
  if (mapped === PORTAL_STAGE.AGUARDANDO_CLIENTE) return 'aguardando';
  if (mapped === PORTAL_STAGE.RESOLVIDO) return 'resolvido';
  if (mapped === PORTAL_STAGE.ENCERRADO || mapped === PORTAL_STAGE.CANCELADO) {
    return 'encerrado';
  }

  const normalized = normalizeStageKey(stageName);
  if (!normalized) return 'outros';
  if (normalized.includes('pendente') || normalized === 'pending') {
    return 'novo';
  }
  if (normalized.includes('aguardando') || normalized.includes('waiting')) {
    return 'aguardando';
  }
  if (
    normalized.includes('atend') ||
    normalized.includes('execuc') ||
    normalized.includes('execut') ||
    normalized.includes('in progress') ||
    normalized === 'progress' ||
    /^em execu/.test(normalized)
  ) {
    return 'atendimento';
  }
  if (normalized.includes('resolv')) return 'resolvido';
  if (
    normalized.includes('encerr') ||
    normalized.includes('fechad') ||
    normalized.includes('cancel')
  ) {
    return 'encerrado';
  }
  return 'outros';
}
