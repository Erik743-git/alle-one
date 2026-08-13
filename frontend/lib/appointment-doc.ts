export const APPOINTMENT_DOC_PREFIX = "__ALLEONE_DOC_V1__:";

export type StoredTextBlock = {
  type: "text";
  content: string;
  /** Quando true, `content` é fragmento HTML (B/I/U/listas). */
  html?: boolean;
};
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
    .map((block) => {
      if (block.type !== "text") return "[imagem]";
      if (block.html) return stripHtmlToPlain(block.content);
      return block.content;
    })
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

const ALLOWED_HTML_TAGS = new Set([
  "B",
  "STRONG",
  "I",
  "EM",
  "U",
  "S",
  "BR",
  "P",
  "DIV",
  "UL",
  "OL",
  "LI",
  "SPAN",
]);

/** Sanitiza fragmento HTML do editor (só tags de formatação básicas). */
export function sanitizeComposerHtml(html: string): string {
  if (typeof document === "undefined") {
    return stripHtmlToPlain(html);
  }
  const root = document.createElement("div");
  root.innerHTML = html;

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) return;
    if (!(node instanceof HTMLElement)) {
      node.parentNode?.removeChild(node);
      return;
    }
    const tag = node.tagName.toUpperCase();
    if (!ALLOWED_HTML_TAGS.has(tag)) {
      const parent = node.parentNode;
      if (!parent) return;
      while (node.firstChild) {
        parent.insertBefore(node.firstChild, node);
      }
      parent.removeChild(node);
      return;
    }
    for (const attr of Array.from(node.attributes)) {
      node.removeAttribute(attr.name);
    }
    for (const child of Array.from(node.childNodes)) {
      walk(child);
    }
  };

  for (const child of Array.from(root.childNodes)) {
    walk(child);
  }
  return root.innerHTML.trim();
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
    return plain
      .replace(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi, "[imagem]")
      .replace(/\s+/g, " ")
      .trim();
  }
  return raw;
}
