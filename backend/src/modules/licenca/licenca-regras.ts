import { isClientPortalRole } from '../../common/security/client-portal-role';

/** Apontamentos de horas por chamado para cliente sem licença. */
export const LIMITE_APONTAMENTOS_SEM_LICENCA = 2;

export const MENSAGEM_SEM_LICENCA =
  'Você já fez 2 apontamentos neste chamado. Para continuar apontando, ' +
  'comunique o financeiro ou um administrador para adquirir o licenciamento.';

/**
 * Licença só vale para usuário de cliente marcado como responsável; para os
 * demais o campo fica sempre falso (não sobra "licenciado" escondido).
 */
export function licencaValida(
  role: string | null | undefined,
  responsavel: boolean,
  licenciado: boolean,
): boolean {
  return Boolean(licenciado && responsavel && isClientPortalRole(role));
}

/**
 * Comunicação é gravada como apontamento de 0 minuto (início = fim) e não
 * conta no limite.
 */
export function contaNoLimite(initTime: string, endTime: string): boolean {
  return initTime.trim() !== endTime.trim();
}

/** Cliente sem licença que já chegou ao limite não aponta mais horas. */
export function bloqueiaApontamentoSemLicenca(params: {
  role: string | null | undefined;
  licenciado: boolean;
  initTime: string;
  endTime: string;
  jaFeitos: number;
}): boolean {
  if (!isClientPortalRole(params.role) || params.licenciado) return false;
  if (!contaNoLimite(params.initTime, params.endTime)) return false;
  return params.jaFeitos >= LIMITE_APONTAMENTOS_SEM_LICENCA;
}
