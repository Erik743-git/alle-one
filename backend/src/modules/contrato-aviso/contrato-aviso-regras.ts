/** Aviso de consumo de contrato (80% e 100% das horas do mês), sem banco. */

export const FAIXAS = [80, 100] as const;
export type Faixa = (typeof FAIXAS)[number];

/** Mês (AAAA-MM) no fuso de Brasília, e o primeiro/último instante dele. */
export function mesBrasilia(agora: Date): {
  mes: string;
  inicio: Date;
  fim: Date;
} {
  const local = new Date(agora.getTime() - 3 * 3_600_000);
  const ano = local.getUTCFullYear();
  const m = local.getUTCMonth();
  // 00:00 de Brasília = 03:00 UTC.
  const inicio = new Date(Date.UTC(ano, m, 1, 3, 0, 0, 0));
  const fim = new Date(Date.UTC(ano, m + 1, 1, 3, 0, 0, 0) - 1);
  return { mes: `${ano}-${String(m + 1).padStart(2, '0')}`, inicio, fim };
}

export function percentual(usadas: number, contratadas: number): number | null {
  if (!(contratadas > 0)) return null;
  return Math.round((usadas / contratadas) * 1000) / 10;
}

/**
 * Faixas que ainda precisam de aviso. Se o consumo pulou direto para 100%,
 * sai só o de 100% (as duas ficam registradas para não repetir).
 */
export function faixasParaAvisar(
  pct: number | null,
  jaAvisadas: number[],
): { registrar: Faixa[]; avisar: Faixa | null } {
  if (pct == null) return { registrar: [], avisar: null };
  const novas = FAIXAS.filter((f) => pct >= f && !jaAvisadas.includes(f));
  if (!novas.length) return { registrar: [], avisar: null };
  return { registrar: novas, avisar: novas[novas.length - 1] };
}
