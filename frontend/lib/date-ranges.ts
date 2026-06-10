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
