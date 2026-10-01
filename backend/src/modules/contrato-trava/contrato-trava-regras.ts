/**
 * Trava de apontamento por contrato (docs/desenho/TRAVA-CONTRATO.md).
 * Regras puras; a conta de horas é a mesma do aviso de contrato por linha.
 */

/**
 * Já esgotou? O lançamento que estoura passa (o trabalho foi feito); quem
 * chega depois de o limite ser atingido é barrado.
 */
export function horasEsgotadas(usadas: number, contratadas: number): boolean {
  if (!(contratadas > 0)) return false;
  return usadas >= contratadas;
}

/** Admin pode apontar mesmo com a trava (fica na auditoria do apontamento). */
export function passaPelaTrava(role: string | null | undefined): boolean {
  return role === 'ADMIN';
}

function horas(n: number): string {
  const min = Math.round(n * 60);
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

export function mensagemTrava(params: {
  contrato: string;
  especialidade: string;
  usadas: number;
  contratadas: number;
}): string {
  return (
    `As horas do contrato "${params.contrato}" (${params.especialidade}) ` +
    `deste mês acabaram (${horas(params.usadas)} de ${horas(params.contratadas)}). ` +
    'Entre em contato com o seu gestor.'
  );
}

/** Mês do apontamento (AAAA-MM-DD) como instante dentro dele, em Brasília. */
export function instanteDoDia(dataYmd: string): Date {
  // 15:00 UTC = 12:00 de Brasília: nunca cai no mês vizinho.
  return new Date(`${dataYmd.slice(0, 10)}T15:00:00.000Z`);
}
