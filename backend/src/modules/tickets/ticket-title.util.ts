/** Prefixo padrão do cliente no título do chamado (`CLIENTE - …`). */
export function clientTitlePrefix(clientName: string): string {
  const name = clientName.trim();
  if (!name) return '';
  return `${name.toUpperCase()} - `;
}

/** Troca o prefixo do cliente no título sem perder o restante digitado. */
export function applyClientTitlePrefix(
  title: string | null | undefined,
  knownClientNames: string[],
  nextClientName: string | null | undefined,
): string {
  let rest = (title ?? '').trim();
  const prefixes = knownClientNames
    .map((name) => clientTitlePrefix(name))
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  for (const prefix of prefixes) {
    if (
      rest
        .toLocaleUpperCase('pt-BR')
        .startsWith(prefix.toLocaleUpperCase('pt-BR'))
    ) {
      rest = rest.slice(prefix.length);
      break;
    }
  }

  const next = nextClientName ? clientTitlePrefix(nextClientName) : '';
  if (!next) return rest;
  if (
    rest.toLocaleUpperCase('pt-BR').startsWith(next.toLocaleUpperCase('pt-BR'))
  ) {
    return rest;
  }
  return `${next}${rest}`;
}
