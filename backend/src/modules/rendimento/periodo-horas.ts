import {
  resolvePayrollPeriodRange,
  resolvePayrollPeriodRangeForCalendarMonth,
} from './rendimento-payroll-period.helper';

/**
 * Período das horas escolhido na tela (lista de Apontamentos e Excel):
 * - "mes": mês civil, do dia 1 ao último dia;
 * - "folha": ciclo 26 → 25.
 */
export type PeriodoHoras = 'mes' | 'folha';

export const PERIODOS_HORAS: PeriodoHoras[] = ['mes', 'folha'];

export type IntervaloHoras = {
  periodo: PeriodoHoras;
  start: Date;
  end: Date;
};

function mesCivil(reference: Date): { start: Date; end: Date } {
  const start = new Date(reference.getFullYear(), reference.getMonth(), 1);
  const end = new Date(reference.getFullYear(), reference.getMonth() + 1, 0);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  return { start, end };
}

/**
 * Lista de Apontamentos: o período corrente. Folha = o ciclo que contém a
 * data (28/09 → 26/09 a 25/10).
 */
export function intervaloAtual(
  periodo: PeriodoHoras,
  reference: Date,
): IntervaloHoras {
  if (periodo === 'folha') {
    const r = resolvePayrollPeriodRange(reference);
    return { periodo, start: r.start, end: r.end };
  }
  return { periodo, ...mesCivil(reference) };
}

/**
 * Excel da agenda (mês na tela): mês civil do mês exibido, ou o ciclo que
 * termina nele (setembro → 26/08 a 25/09), igual ao Fechamento.
 */
export function intervaloDoMesExibido(
  periodo: PeriodoHoras,
  reference: Date,
): IntervaloHoras {
  if (periodo === 'folha') {
    const r = resolvePayrollPeriodRangeForCalendarMonth(reference);
    return { periodo, start: r.start, end: r.end };
  }
  return { periodo, ...mesCivil(reference) };
}
