/** Período de referência do rendimento: dia 25 até dia 24 do mês seguinte. */

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

/** Retorna o intervalo 25→24 que contém a data de referência. */
export function resolvePayrollPeriodRange(reference: Date): PayrollPeriodRange {
  const ref = new Date(reference);
  ref.setHours(0, 0, 0, 0);

  const year = ref.getFullYear();
  const month = ref.getMonth();
  const day = ref.getDate();

  let start: Date;
  let end: Date;

  if (day >= 25) {
    start = new Date(year, month, 25);
    end = new Date(year, month + 1, 24);
  } else {
    start = new Date(year, month - 1, 25);
    end = new Date(year, month, 24);
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
