/**
 * Vocabulário canônico de estágios do portal (negócio Alle).
 * Nomes TiFlux de mesa podem diferir; na persistência portal preferimos estes.
 */
export const PORTAL_STAGE = {
  NOVO: 'Novo',
  EM_ATENDIMENTO: 'Em Atendimento',
  AGUARDANDO_CLIENTE: 'Aguardando Cliente',
  RESOLVIDO: 'Resolvido',
  ENCERRADO: 'Encerrado',
  CANCELADO: 'Cancelado',
} as const;

export type PortalStageName = (typeof PORTAL_STAGE)[keyof typeof PORTAL_STAGE];

export const PORTAL_STAGES_ORDER: PortalStageName[] = [
  PORTAL_STAGE.NOVO,
  PORTAL_STAGE.EM_ATENDIMENTO,
  PORTAL_STAGE.AGUARDANDO_CLIENTE,
  PORTAL_STAGE.RESOLVIDO,
  PORTAL_STAGE.ENCERRADO,
  PORTAL_STAGE.CANCELADO,
];

/** Mapa legado → canônico (persistência / migration). */
export const LEGACY_STAGE_TO_PORTAL: Record<string, PortalStageName> = {
  aberto: PORTAL_STAGE.NOVO,
  novo: PORTAL_STAGE.NOVO,
  pendente: PORTAL_STAGE.NOVO,
  pending: PORTAL_STAGE.NOVO,
  'em andamento': PORTAL_STAGE.EM_ATENDIMENTO,
  'em atendimento': PORTAL_STAGE.EM_ATENDIMENTO,
  'em execucao': PORTAL_STAGE.EM_ATENDIMENTO,
  'em execução': PORTAL_STAGE.EM_ATENDIMENTO,
  'in progress': PORTAL_STAGE.EM_ATENDIMENTO,
  progress: PORTAL_STAGE.EM_ATENDIMENTO,
  aguardando: PORTAL_STAGE.AGUARDANDO_CLIENTE,
  'aguardando usuario': PORTAL_STAGE.AGUARDANDO_CLIENTE,
  'aguardando usuário': PORTAL_STAGE.AGUARDANDO_CLIENTE,
  'aguardando cliente': PORTAL_STAGE.AGUARDANDO_CLIENTE,
  waiting: PORTAL_STAGE.AGUARDANDO_CLIENTE,
  resolvido: PORTAL_STAGE.RESOLVIDO,
  resolved: PORTAL_STAGE.RESOLVIDO,
  fechado: PORTAL_STAGE.ENCERRADO,
  encerrado: PORTAL_STAGE.ENCERRADO,
  closed: PORTAL_STAGE.ENCERRADO,
  cancelado: PORTAL_STAGE.CANCELADO,
  cancelled: PORTAL_STAGE.CANCELADO,
  canceled: PORTAL_STAGE.CANCELADO,
};

export function normalizeStageCompareKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ');
}

export function mapLegacyStageToPortal(
  stageName: string | null | undefined,
): string | null {
  if (stageName == null) return null;
  const trimmed = String(stageName).trim();
  if (!trimmed) return null;
  const key = normalizeStageCompareKey(trimmed);
  return LEGACY_STAGE_TO_PORTAL[key] ?? trimmed;
}

export function isTerminalPortalStage(
  stageName: string | null | undefined,
): boolean {
  const mapped = mapLegacyStageToPortal(stageName);
  return mapped === PORTAL_STAGE.ENCERRADO || mapped === PORTAL_STAGE.CANCELADO;
}
