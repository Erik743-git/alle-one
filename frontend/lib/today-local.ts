/**
 * Data de hoje (AAAA-MM-DD) no fuso do navegador.
 *
 * Não usar `new Date().toISOString().slice(0, 10)`: isso é a data em UTC, que
 * a partir das 21h de Brasília já é o dia seguinte — apontamentos feitos à
 * noite saíam com a data de amanhã.
 */
export function todayYmdLocal(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
