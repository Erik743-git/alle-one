import { BadRequestException } from '@nestjs/common';

import { PORTAL_STAGE, mapLegacyStageToPortal } from './portal-ticket-stages';

/** Tamanho mínimo do motivo: evita "ok", "." e afins. */
export const MOTIVO_CANCELAMENTO_MINIMO = 10;
export const MOTIVO_CANCELAMENTO_MAXIMO = 1000;
/** Motivo gravado quando quem cancela é uma automação, sem pessoa. */
export const MOTIVO_CANCELAMENTO_AUTOMACAO = 'Cancelado por automação.';

export function ehCancelado(nome: string | null | undefined): boolean {
  return mapLegacyStageToPortal(nome) === PORTAL_STAGE.CANCELADO;
}

/**
 * Todo cancelamento de chamado precisa de motivo (fica no histórico). Só
 * vale quando o chamado passa a Cancelado; quem já está cancelado não pede.
 */
export function exigirMotivoCancelamento(
  motivo: string | null | undefined,
): string {
  const texto = (motivo ?? '').trim();
  if (texto.length < MOTIVO_CANCELAMENTO_MINIMO) {
    throw new BadRequestException(
      `Informe o motivo do cancelamento (mínimo de ${MOTIVO_CANCELAMENTO_MINIMO} caracteres).`,
    );
  }
  return texto.slice(0, MOTIVO_CANCELAMENTO_MAXIMO);
}
