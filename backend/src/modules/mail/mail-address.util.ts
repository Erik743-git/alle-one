export type MailAddress = { address: string; name?: string };

/** Aceita "email@x.com" ou "Nome <email@x.com>" (nome entre aspas ou não). */
export function parseMailAddress(raw: string): MailAddress | null {
  const value = raw.trim();
  if (!value) return null;
  const angled = /^(.*)<\s*([^<>\s]+@[^<>\s]+)\s*>$/.exec(value);
  if (angled) {
    const name = angled[1]
      .trim()
      .replace(/^"(.*)"$/, '$1')
      .trim();
    return name ? { name, address: angled[2] } : { address: angled[2] };
  }
  return /^[^\s@]+@[^\s@]+$/.test(value) ? { address: value } : null;
}

/**
 * Normaliza destinatários no formato que o nodemailer aceitava: string única
 * com vírgula/ponto e vírgula, lista de strings, ou mistura das duas.
 */
export function parseMailAddressList(
  value: string | string[] | undefined,
): MailAddress[] {
  if (!value) return [];
  const items = Array.isArray(value) ? value : [value];
  const out: MailAddress[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    // Listas montadas a partir do banco às vezes trazem null no meio.
    if (typeof item !== 'string') continue;
    for (const piece of splitAddressList(item)) {
      const parsed = parseMailAddress(piece);
      if (!parsed) continue;
      const key = parsed.address.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(parsed);
    }
  }
  return out;
}

/** Separa por vírgula ou ponto e vírgula sem quebrar "Silva, João" <x@y>. */
function splitAddressList(value: string): string[] {
  const parts: string[] = [];
  let current = '';
  let quoted = false;
  let angled = false;
  for (const ch of value) {
    if (ch === '"') quoted = !quoted;
    else if (ch === '<') angled = true;
    else if (ch === '>') angled = false;
    if ((ch === ',' || ch === ';') && !quoted && !angled) {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts;
}
