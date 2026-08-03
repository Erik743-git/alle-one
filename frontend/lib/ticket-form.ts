/** Formata telefone BR (10 ou 11 dígitos). */
export function formatBrPhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits.length ? `(${digits}` : "";
  if (digits.length <= 6) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  }
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function isValidBrPhone(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return digits.length === 0 || digits.length === 10 || digits.length === 11;
}

export function clientTitlePrefix(clientName: string): string {
  const name = clientName.trim();
  if (!name) return "";
  return `${name.toUpperCase()} - `;
}

/** Troca o prefixo do cliente no título sem perder o restante digitado. */
export function applyClientTitlePrefix(
  title: string,
  clientNames: string[],
  nextClientName: string | null,
): string {
  let rest = title;
  const prefixes = clientNames
    .map((n) => clientTitlePrefix(n))
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  for (const prefix of prefixes) {
    if (rest.toLocaleUpperCase("pt-BR").startsWith(prefix.toLocaleUpperCase("pt-BR"))) {
      rest = rest.slice(prefix.length);
      break;
    }
  }

  const next = nextClientName ? clientTitlePrefix(nextClientName) : "";
  if (!next) return rest;
  if (rest.toLocaleUpperCase("pt-BR").startsWith(next.toLocaleUpperCase("pt-BR"))) {
    return rest;
  }
  return `${next}${rest}`;
}
