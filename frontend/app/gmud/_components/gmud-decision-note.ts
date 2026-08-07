export type ParsedGmudDecisionNote = {
  freeNote: string | null;
  onBehalfOfName: string | null;
  onBehalfOfEmail: string | null;
  actedByEmail: string | null;
  evidenceFileId: string | null;
};

/** Interpreta o decisionNote legado (APROVADO_EM_NOME_DE|POR|EVIDENCIA_FILE_ID) e texto livre. */
export function parseGmudDecisionNote(
  raw: string | null | undefined,
): ParsedGmudDecisionNote {
  const empty: ParsedGmudDecisionNote = {
    freeNote: null,
    onBehalfOfName: null,
    onBehalfOfEmail: null,
    actedByEmail: null,
    evidenceFileId: null,
  };
  if (!raw?.trim()) return empty;

  const parts = raw
    .split("|")
    .map((p) => p.trim())
    .filter(Boolean);

  let freeNote: string | null = null;
  let onBehalfOfName: string | null = null;
  let onBehalfOfEmail: string | null = null;
  let actedByEmail: string | null = null;
  let evidenceFileId: string | null = null;

  for (const part of parts) {
    const onBehalf = /^APROVADO_EM_NOME_DE:(.+)$/i.exec(part);
    if (onBehalf) {
      const value = onBehalf[1].trim();
      const withEmail = /^(.+?)\(([^)]+)\)$/.exec(value);
      if (withEmail) {
        onBehalfOfName = withEmail[1].trim();
        onBehalfOfEmail = withEmail[2].trim();
      } else {
        onBehalfOfName = value;
      }
      continue;
    }

    const por = /^POR:(.+)$/i.exec(part);
    if (por) {
      actedByEmail = por[1].trim();
      continue;
    }

    const evidence = /^EVIDENCIA_FILE_ID:(.+)$/i.exec(part);
    if (evidence) {
      evidenceFileId = evidence[1].trim();
      continue;
    }

    freeNote = freeNote ? `${freeNote} | ${part}` : part;
  }

  return {
    freeNote,
    onBehalfOfName,
    onBehalfOfEmail,
    actedByEmail,
    evidenceFileId,
  };
}
