export const APPOINTMENT_DOC_PREFIX = "__ALLEONE_DOC_V1__:";

export type StoredTextBlock = { type: "text"; content: string };
export type StoredImageBlock = {
  type: "image";
  fileIndex: number;
  fileId?: string;
  dataUrl?: string;
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
