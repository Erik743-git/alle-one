/**
 * Período de até 1 mês civil (mesmo mês/ano ou um único mês no intervalo):
 * monitoramento por semana. Acima disso, por mês.
 */
export function isMonitoringPeriodWeekly(start: Date, end: Date): boolean {
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return true;
  }
  const from = start <= end ? start : end;
  const to = start <= end ? end : start;
  const startBucket = from.getFullYear() * 12 + from.getMonth();
  const endBucket = to.getFullYear() * 12 + to.getMonth();
  return endBucket - startBucket + 1 <= 1;
}
