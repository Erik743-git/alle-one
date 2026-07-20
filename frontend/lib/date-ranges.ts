import { format } from "date-fns";

export function toDateInputValue(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

/** Primeiro e último dia do mês (YYYY-MM-DD). */
export function monthRangeFor(date: Date) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return {
    start: toDateInputValue(start),
    end: toDateInputValue(end),
  };
}

/** Período folha 26→25 que contém a data (alinhado ao rendimento). */
export function payrollPeriodRangeFor(date: Date) {
  const ref = new Date(date);
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

  return {
    start: toDateInputValue(start),
    end: toDateInputValue(end),
  };
}
