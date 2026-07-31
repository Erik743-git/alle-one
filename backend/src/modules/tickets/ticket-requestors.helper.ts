export type TicketRequestorOption = {
  id: number;
  name: string;
  email: string | null;
  telephone: string | null;
};

const ALLE_INTERNAL_ALLOWED_DOMAINS = new Set([
  'alletecnologia.com',
]);

/** Clientes internos Alle (Tecnologia / Infra) — sugestões só com domínio Alle. */
export function isAlleInternalClientName(name: string | null | undefined): boolean {
  const normalized = String(name ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return false;
  if (normalized.includes('alle tecnologia')) return true;
  if (normalized.includes('alle infra')) return true;
  // Nomes curtos tipo "Alle" + tecnologia/infra em variantes
  if (/^alle(\s|$)/.test(normalized) && /tecnologia|infra/.test(normalized)) {
    return true;
  }
  return false;
}

export function emailDomain(email: string | null | undefined): string | null {
  const value = String(email ?? '').trim().toLowerCase();
  const at = value.lastIndexOf('@');
  if (at <= 0 || at === value.length - 1) return null;
  return value.slice(at + 1);
}

function isNoReplyEmail(email: string): boolean {
  const local = email.split('@')[0] ?? '';
  return /^(no[\-_]?reply|noreply|mailer[\-_]?daemon|postmaster|donotreply)$/i.test(
    local,
  );
}

/**
 * Remove duplicatas por e-mail (case-insensitive) e, para clientes Alle
 * Tecnologia/Infra, mantém apenas @alletecnologia.com.
 */
export function sanitizeTicketRequestors(
  rows: TicketRequestorOption[],
  opts?: { clientName?: string | null },
): TicketRequestorOption[] {
  const alleInternal = isAlleInternalClientName(opts?.clientName);
  const byEmail = new Map<string, TicketRequestorOption>();
  const withoutEmail: TicketRequestorOption[] = [];

  for (const row of rows) {
    const email = row.email?.trim() || null;
    const name = row.name?.trim() || '';
    if (!name && !email) continue;

    if (!email) {
      // Sem e-mail: só útil fora do filtro Alle interno
      if (!alleInternal) {
        withoutEmail.push({
          ...row,
          name: name || email || `Solicitante ${row.id}`,
          email: null,
        });
      }
      continue;
    }

    const emailKey = email.toLowerCase();
    if (isNoReplyEmail(emailKey)) continue;

    if (alleInternal) {
      const domain = emailDomain(emailKey);
      if (!domain || !ALLE_INTERNAL_ALLOWED_DOMAINS.has(domain)) continue;
    }

    const existing = byEmail.get(emailKey);
    if (!existing) {
      byEmail.set(emailKey, {
        id: row.id,
        name: name || email,
        email,
        telephone: row.telephone?.trim() || null,
      });
      continue;
    }

    // Prefere nome “humano” (não igual ao e-mail) e telefone preenchido
    const existingNameIsEmail =
      existing.name.trim().toLowerCase() === (existing.email ?? '').toLowerCase();
    const nextNameIsEmail = name.toLowerCase() === emailKey;
    if (existingNameIsEmail && !nextNameIsEmail) {
      existing.name = name;
      existing.email = email;
      existing.id = row.id;
    }
    if (!existing.telephone && row.telephone?.trim()) {
      existing.telephone = row.telephone.trim();
    }
  }

  const merged = [...byEmail.values(), ...withoutEmail];
  merged.sort((a, b) =>
    a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }),
  );
  return merged;
}

/** Id numérico estável para solicitantes montados no portal (sem id TiFlux). */
export function portalRequestorSyntheticId(email: string): number {
  let hash = 0;
  const key = email.trim().toLowerCase();
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  const positive = Math.abs(hash) || 1;
  // Faixa alta para não colidir com ids TiFlux típicos
  return 1_000_000_000 + (positive % 900_000_000);
}
