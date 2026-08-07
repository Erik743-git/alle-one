export const APPOINTMENT_DOC_PREFIX = "__ALLEONE_DOC_V1__:";

export type StoredTextBlock = { type: "text"; content: string };
export type StoredImageBlock = {
  type: "image";
  fileIndex: number;
  fileId?: string;
  dataUrl?: string;
  /** Largura em px no editor (persistida para manter o tamanho do print). */
  width?: number;
};
export type StoredBlock = StoredTextBlock | StoredImageBlock;

export type AppointmentStoredDoc = {
  version: 1;
  blocks: StoredBlock[];
};

export function isAppointmentDoc(description: string | null | undefined): boolean {
  return Boolean(description?.startsWith(APPOINTMENT_DOC_PREFIX));
}

export function parseAppointmentDoc(description: string): AppointmentStoredDoc | null {
  try {
    const parsed = JSON.parse(
      description.slice(APPOINTMENT_DOC_PREFIX.length),
    ) as AppointmentStoredDoc;
    if (parsed?.version === 1 && Array.isArray(parsed.blocks)) {
      return parsed;
    }
  } catch {
    /* formato legado em texto puro */
  }
  return null;
}

export function serializeAppointmentDoc(blocks: StoredBlock[]): string {
  return APPOINTMENT_DOC_PREFIX + JSON.stringify({ version: 1, blocks });
}

export function appointmentDocToPlainText(doc: AppointmentStoredDoc): string {
  return doc.blocks
    .map((block) => (block.type === "text" ? block.content : "[imagem]"))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function appointmentDescriptionToPlainText(description: string): string {
  if (!isAppointmentDoc(description)) return description;
  const doc = parseAppointmentDoc(description);
  return doc ? appointmentDocToPlainText(doc) : description;
}

export function looksLikeHtml(value: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

/** Remove tags HTML (e-mail Outlook, etc.) para texto editável. */
export function stripHtmlToPlain(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Texto seguro para o modal de edição (sem HTML cru / doc Alle One).
 * Imagens embutidas viram marcador curto.
 */
export function normalizeTicketDescriptionForEdit(
  description: string | null | undefined,
): string {
  const raw = description?.trim() ?? "";
  if (!raw) return "";
  if (isAppointmentDoc(raw)) {
    return appointmentDescriptionToPlainText(raw);
  }
  if (looksLikeHtml(raw)) {
    const plain = stripHtmlToPlain(raw);
    // data: URLs gigantes às vezes sobram como lixo após strip parcial
    return plain
      .replace(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi, "[imagem]")
      .replace(/\s+/g, " ")
      .trim();
  }
  return raw;
}
