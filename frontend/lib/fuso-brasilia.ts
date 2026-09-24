/**
 * Horário de Brasília, independente do fuso do navegador.
 *
 * Janela de manutenção é combinada em horário de parede ("22h às 06h") e a
 * GMUD é gravada em instante (UTC). Quem abre o portal de outro fuso precisa
 * ver o mesmo horário que o cliente combinou.
 */
export const FUSO_BRASILIA = "America/Sao_Paulo";

const PARTES = new Intl.DateTimeFormat("en-US", {
  timeZone: FUSO_BRASILIA,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function partes(instante: Date) {
  const lista = PARTES.formatToParts(instante);
  const valor = (tipo: string) =>
    lista.find((p) => p.type === tipo)?.value ?? "";
  return {
    ano: valor("year"),
    mes: valor("month"),
    dia: valor("day"),
    hora: valor("hour"),
    minuto: valor("minute"),
    segundo: valor("second"),
  };
}

/** "YYYY-MM-DD" do instante, em Brasília. */
export function diaBrasilia(iso: string | Date): string {
  const p = partes(new Date(iso));
  return `${p.ano}-${p.mes}-${p.dia}`;
}

/** "HH:MM" do instante, em Brasília. */
export function horaBrasilia(iso: string | Date): string {
  const p = partes(new Date(iso));
  return `${p.hora}:${p.minuto}`;
}

/** Valor para <input type="datetime-local"> ("YYYY-MM-DDTHH:MM"), em Brasília. */
export function isoParaCampoBrasilia(iso: string): string {
  return `${diaBrasilia(iso)}T${horaBrasilia(iso)}`;
}

function deslocamentoMin(instante: Date): number {
  const p = partes(instante);
  const comoUtc = Date.UTC(
    Number(p.ano),
    Number(p.mes) - 1,
    Number(p.dia),
    Number(p.hora),
    Number(p.minuto),
    Number(p.segundo),
  );
  return Math.round((comoUtc - instante.getTime()) / 60_000);
}

/**
 * "YYYY-MM-DDTHH:MM" lido como horário de Brasília → ISO (UTC).
 * Devolve null para valor vazio ou inválido.
 */
export function campoBrasiliaParaIso(valor: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(valor);
  if (!m) return null;
  const ingenuo = Date.UTC(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
  );
  // Segunda passada acerta o dia da virada, se o horário de verão voltar.
  let t = ingenuo - deslocamentoMin(new Date(ingenuo)) * 60_000;
  t = ingenuo - deslocamentoMin(new Date(t)) * 60_000;
  return new Date(t).toISOString();
}
