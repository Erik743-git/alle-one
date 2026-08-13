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
