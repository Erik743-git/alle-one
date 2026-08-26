/**
 * Vocabulário canônico de estágios (espelho do backend).
 */
export const PORTAL_STAGE = {
  NOVO: "Novo",
  EM_ATENDIMENTO: "Em Atendimento",
  AGUARDANDO_CLIENTE: "Aguardando Cliente",
  RESOLVIDO: "Resolvido",
  ENCERRADO: "Encerrado",
  CANCELADO: "Cancelado",
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

const LEGACY_STAGE_TO_PORTAL: Record<string, PortalStageName> = {
  aberto: PORTAL_STAGE.NOVO,
  novo: PORTAL_STAGE.NOVO,
  pendente: PORTAL_STAGE.NOVO,
  pending: PORTAL_STAGE.NOVO,
  "em andamento": PORTAL_STAGE.EM_ATENDIMENTO,
  "em atendimento": PORTAL_STAGE.EM_ATENDIMENTO,
  "em execucao": PORTAL_STAGE.EM_ATENDIMENTO,
  "em execução": PORTAL_STAGE.EM_ATENDIMENTO,
  "in progress": PORTAL_STAGE.EM_ATENDIMENTO,
  progress: PORTAL_STAGE.EM_ATENDIMENTO,
  aguardando: PORTAL_STAGE.AGUARDANDO_CLIENTE,
  "aguardando usuario": PORTAL_STAGE.AGUARDANDO_CLIENTE,
  "aguardando usuário": PORTAL_STAGE.AGUARDANDO_CLIENTE,
  "aguardando cliente": PORTAL_STAGE.AGUARDANDO_CLIENTE,
  resolvido: PORTAL_STAGE.RESOLVIDO,
  resolved: PORTAL_STAGE.RESOLVIDO,
  encerrado: PORTAL_STAGE.ENCERRADO,
  fechado: PORTAL_STAGE.ENCERRADO,
  closed: PORTAL_STAGE.ENCERRADO,
  cancelado: PORTAL_STAGE.CANCELADO,
  cancelled: PORTAL_STAGE.CANCELADO,
  canceled: PORTAL_STAGE.CANCELADO,
};

function normalizeStageKey(stageName: string): string {
  return stageName
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ");
}

export function mapLegacyStageToPortal(
  stageName: string | null | undefined,
): PortalStageName | null {
  if (!stageName?.trim()) return null;
  const key = normalizeStageKey(stageName);
  return LEGACY_STAGE_TO_PORTAL[key] ?? null;
}

/** Resolvido, encerrado ou cancelado — ticket não recebe novos apontamentos. */
export function isDonePortalStage(
  stageName: string | null | undefined,
): boolean {
  const mapped = mapLegacyStageToPortal(stageName);
  return (
    mapped === PORTAL_STAGE.RESOLVIDO ||
    mapped === PORTAL_STAGE.ENCERRADO ||
    mapped === PORTAL_STAGE.CANCELADO
  );
}

export function canAddAppointmentToTicket(params: {
  isClosed: boolean;
  stageName: string | null | undefined;
}): boolean {
  if (params.isClosed) return false;
  return !isDonePortalStage(params.stageName);
}
