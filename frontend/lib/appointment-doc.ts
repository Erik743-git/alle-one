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
  "STRIKE",
  "BR",
  "P",
  "DIV",
  "UL",
  "OL",
  "LI",
  "SPAN",
  "A",
  "H1",
  "H2",
  "H3",
  "H4",
  "BLOCKQUOTE",
  "PRE",
  "CODE",
  "FONT",
]);

const ALLOWED_STYLE_PROPS = new Set([
  "color",
  "font-size",
  "font-family",
  "text-align",
  "font-weight",
  "font-style",
  "text-decoration",
]);

const DANGEROUS_CSS = /url\s*\(|expression|javascript|@import|behavior/i;
const SAFE_COLOR =
  /^(#[0-9a-fA-F]{3,8}|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)|rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*(0|0?\.\d+|1(\.0+)?)\s*\)|[a-zA-Z]{1,24})$/;
const SAFE_FONT_SIZE = /^\d+(\.\d+)?(px|pt|em|rem|%)$/;
const SAFE_FONT_FAMILY = /^[a-zA-Z0-9\s,"'-]+$/;
const SAFE_ALIGN = /^(left|right|center|justify)$/i;
const SAFE_WEIGHT = /^(normal|bold|[1-9]00)$/i;
const SAFE_FONT_STYLE = /^(normal|italic)$/i;
const SAFE_DECORATION =
  /^(none|underline|line-through|underline line-through|line-through underline)$/i;

export const COMPOSER_HTML_CLASS = [
  "[&_b]:font-semibold [&_strong]:font-semibold",
  "[&_i]:italic [&_em]:italic [&_u]:underline",
  "[&_s]:line-through [&_strike]:line-through",
  "[&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5",
  "[&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5",
  "[&_h1]:my-2 [&_h1]:text-xl [&_h1]:font-semibold",
  "[&_h2]:my-2 [&_h2]:text-lg [&_h2]:font-semibold",
  "[&_h3]:my-1.5 [&_h3]:text-base [&_h3]:font-semibold",
  "[&_h4]:my-1 [&_h4]:text-sm [&_h4]:font-semibold",
  "[&_a]:text-primary [&_a]:underline",
  "[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
  "[&_pre]:my-1 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-muted/50 [&_pre]:px-2 [&_pre]:py-1 [&_pre]:font-mono [&_pre]:text-[13px]",
  "[&_code]:rounded-sm [&_code]:bg-muted/50 [&_code]:px-1 [&_code]:font-mono [&_code]:text-[13px]",
].join(" ");

export function sanitizeAllowedStyle(cssText: string): string {
  const parts: string[] = [];
  for (const decl of cssText.split(";")) {
    const idx = decl.indexOf(":");
    if (idx < 0) continue;
    const prop = decl.slice(0, idx).trim().toLowerCase();
    const value = decl.slice(idx + 1).trim();
    if (!ALLOWED_STYLE_PROPS.has(prop) || !value || DANGEROUS_CSS.test(value)) {
      continue;
    }
    let ok = false;
    if (prop === "color") ok = SAFE_COLOR.test(value);
    else if (prop === "font-size") ok = SAFE_FONT_SIZE.test(value);
    else if (prop === "font-family") ok = SAFE_FONT_FAMILY.test(value);
    else if (prop === "text-align") ok = SAFE_ALIGN.test(value);
    else if (prop === "font-weight") ok = SAFE_WEIGHT.test(value);
    else if (prop === "font-style") ok = SAFE_FONT_STYLE.test(value);
    else if (prop === "text-decoration") ok = SAFE_DECORATION.test(value);
    if (ok) parts.push(`${prop}: ${value}`);
  }
  return parts.join("; ");
}

export function sanitizeHref(href: string): string | null {
  const value = href.trim();
  if (!value || /^\s*javascript:/i.test(value) || value.startsWith("data:")) {
    return null;
  }
  if (/^(https?:|mailto:)/i.test(value)) return value;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  return null;
}

function applySafeAttributes(el: HTMLElement) {
  const tag = el.tagName.toUpperCase();
  const style = el.getAttribute("style");
  const href = el.getAttribute("href");
  const align = el.getAttribute("align");
  const fontSize = el.getAttribute("size");
  const fontColor = el.getAttribute("color");
  const fontFace = el.getAttribute("face");

  for (const attr of Array.from(el.attributes)) {
    el.removeAttribute(attr.name);
  }

  if (style) {
    const cleaned = sanitizeAllowedStyle(style);
    if (cleaned) el.setAttribute("style", cleaned);
  }

  if (align && SAFE_ALIGN.test(align)) {
    el.setAttribute("align", align.toLowerCase());
  }

  if (tag === "A") {
    const safeHref = href ? sanitizeHref(href) : null;
    if (safeHref) {
      el.setAttribute("href", safeHref);
      el.setAttribute("rel", "noopener noreferrer");
      if (/^https?:/i.test(safeHref)) {
        el.setAttribute("target", "_blank");
      }
    }
  }

  if (tag === "FONT") {
    if (fontSize && /^[1-7]$/.test(fontSize)) {
      el.setAttribute("size", fontSize);
    }
    if (fontColor && SAFE_COLOR.test(fontColor)) {
      el.setAttribute("color", fontColor);
    }
    if (fontFace && SAFE_FONT_FAMILY.test(fontFace)) {
      el.setAttribute("face", fontFace);
    }
  }
}

/** Sanitiza fragmento HTML do editor (formatação permitida, sem scripts). */
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
    applySafeAttributes(node);
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
