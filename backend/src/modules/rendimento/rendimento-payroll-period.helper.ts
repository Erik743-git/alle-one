/** Período de referência do rendimento: dia 26 até dia 25 do mês seguinte. */

export type PayrollPeriodRange = {
  start: Date;
  end: Date;
  startIso: string;
  endIso: string;
  label: string;
};

function toDateOnlyString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatShortPtBr(date: Date): string {
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  });
}

/** Retorna o intervalo 26→25 que contém a data de referência. */
export function resolvePayrollPeriodRange(reference: Date): PayrollPeriodRange {
  const ref = new Date(reference);
  ref.setHours(0, 0, 0, 0);

  const year = ref.getFullYear();
  const month = ref.getMonth();
  const day = ref.getDate();

  let start: Date;
  let end: Date;

  if (day >= 26) {
    start = new Date(year, month, 26);
    end = new Date(year, month + 1, 25);
  } else {
    start = new Date(year, month - 1, 26);
    end = new Date(year, month, 25);
  }

  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  return {
    start,
    end,
    startIso: toDateOnlyString(start),
    endIso: toDateOnlyString(end),
    label: `${formatShortPtBr(start)} a ${formatShortPtBr(end)}`,
  };
}

/**
 * Período de HE estável para a grade mensal.
 * Usa o dia 15 do mês civil da data de referência para não “pular”
 * o período ao navegar dias 26–31 dentro do mesmo mês civil
 * (ex.: em julho, permanece 26/06→25/07 mesmo no dia 29).
 */
export function resolvePayrollPeriodRangeForCalendarMonth(
  reference: Date,
): PayrollPeriodRange {
  const midMonth = new Date(reference);
  midMonth.setDate(15);
  midMonth.setHours(0, 0, 0, 0);
  return resolvePayrollPeriodRange(midMonth);
}

export type RendimentoPayrollView = 'month' | 'week' | 'day';

/**
 * Período folha para totais de HE e saldo na agenda.
 * - Mês: estável pelo mês civil (via dia 15).
 * - Semana/Dia: período 26→25 que contém a data de referência.
 */
export function resolvePayrollPeriodRangeForTimesheet(
  reference: Date,
  view: RendimentoPayrollView,
): PayrollPeriodRange {
  if (view === 'month') {
    return resolvePayrollPeriodRangeForCalendarMonth(reference);
  }
  return resolvePayrollPeriodRange(reference);
}
