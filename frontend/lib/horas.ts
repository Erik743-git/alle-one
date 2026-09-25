/** Minutos em "29h05" (padrão do portal para horas; nunca "29.08h"). */
export function formatarMinutos(min: number): string {
  const total = Math.max(0, Math.round(min));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}h${String(m).padStart(2, "0")}`;
}

/** "2026-09-25" → "25/09/2026". */
export function dataBr(ymd: string): string {
  return ymd.split("-").reverse().join("/");
}
