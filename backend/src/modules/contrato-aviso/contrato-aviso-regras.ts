/**
 * Aviso de consumo de contrato, por LINHA (contrato + especialidade), sem
 * banco. Combinado em docs/desenho/APONTAMENTOS-TELAS-ADMIN.md (parte 5).
 */

/** Faixas que avisam em qualquer dia, ao serem passadas. */
export const FAIXAS = [50, 80, 100] as const;
export type Faixa = (typeof FAIXAS)[number];

/**
 * Aviso do dia 15: a linha está em 50% ou menos. Guardado como "faixa 0" na
 * mesma tabela, para a chave (linha, mês, faixa) também barrar repetição.
 */
export const FAIXA_DIA15 = 0;
export const LIMITE_DIA15 = 50;
export const HORA_DIA15 = 8;

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

/** Dia do mês e hora no relógio de Brasília (UTC−3 fixo desde 2019). */
export function relogioBrasilia(agora: Date): { dia: number; hora: number } {
  const local = new Date(agora.getTime() - 3 * 3_600_000);
  return { dia: local.getUTCDate(), hora: local.getUTCHours() };
}

export function percentual(usadas: number, contratadas: number): number | null {
  if (!(contratadas > 0)) return null;
  return Math.round((usadas / contratadas) * 1000) / 10;
}

/**
 * Faixas que ainda precisam de aviso. Se o consumo pulou várias de uma vez,
 * sai só o aviso da mais alta (todas ficam registradas para não repetir).
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

/** Dia 15, a partir das 8h de Brasília: a janela do aviso de 50% ou menos. */
export function ehJanelaDia15(agora: Date): boolean {
  const { dia, hora } = relogioBrasilia(agora);
  return dia === 15 && hora >= HORA_DIA15;
}

/**
 * Aviso do dia 15: a partir das 8h de Brasília do dia 15, uma vez no mês,
 * para a linha em 50% ou menos. "A partir das 8h" (e não só às 8h): se a
 * rotina das 8h não rodar (servidor reiniciando), a das 9h cobre.
 */
export function deveAvisarDia15(params: {
  agora: Date;
  pct: number | null;
  jaAvisadas: number[];
}): boolean {
  if (params.pct == null || params.pct > LIMITE_DIA15) return false;
  if (params.jaAvisadas.includes(FAIXA_DIA15)) return false;
  return ehJanelaDia15(params.agora);
}

/** Nome de mesa/especialidade para comparar (caixa, acento, espaços). */
export function chaveNome(nome: string | null | undefined): string {
  return String(nome ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ');
}

/**
 * Horas da linha: as da mesa com o nome da especialidade, na mesma soma por
 * mesa que o Financeiro usa (dashboard, horasPorMesa).
 */
export function horasDaEspecialidade(
  horasPorMesa: Array<{ deskName: string; totalMinutes: number }> | undefined,
  especialidade: string,
): number {
  const alvo = chaveNome(especialidade);
  const minutos = (horasPorMesa ?? [])
    .filter((m) => chaveNome(m.deskName) === alvo)
    .reduce((s, m) => s + (Number(m.totalMinutes) || 0), 0);
  return Math.round((minutos / 60) * 100) / 100;
}
