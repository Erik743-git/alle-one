export const APPOINTMENT_DOC_PREFIX = '__ALLEONE_DOC_V1__:';

type StoredTextBlock = { type: 'text'; content: string };
type StoredImageBlock = {
  type: 'image';
  fileIndex: number;
  fileId?: string;
  dataUrl?: string;
  width?: number;
};
type StoredBlock = StoredTextBlock | StoredImageBlock;

type AppointmentStoredDoc = {
  version: 1;
  blocks: StoredBlock[];
};

function parseAppointmentDoc(description: string): AppointmentStoredDoc | null {
  try {
    const parsed = JSON.parse(
      description.slice(APPOINTMENT_DOC_PREFIX.length),
    ) as AppointmentStoredDoc;
    if (parsed?.version === 1 && Array.isArray(parsed.blocks)) {
      return parsed;
    }
  } catch {
    /* texto legado */
  }
  return null;
}

/** Texto enviado ao TiFlux (sem JSON de blocos). */
export function appointmentDescriptionToPlainText(description: string): string {
  if (!description.startsWith(APPOINTMENT_DOC_PREFIX)) {
    return description;
  }

  const doc = parseAppointmentDoc(description);
  if (!doc) return description;

  return doc.blocks
    .map((block) => (block.type === 'text' ? block.content : '[imagem]'))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Indica se a descrição embute imagem (doc Alle One ou data URL / <img>). */
export function appointmentDescriptionHasMedia(
  description: string | null | undefined,
): boolean {
  const raw = description?.trim() ?? '';
  if (!raw) return false;
  if (raw.startsWith(APPOINTMENT_DOC_PREFIX)) {
    const doc = parseAppointmentDoc(raw);
    return Boolean(doc?.blocks.some((block) => block.type === 'image'));
  }
  return /<img[\s\S]*src\s*=/i.test(raw) || raw.includes('data:image/');
}

export type SavedAppointmentImage = {
  fileId: string;
  mimeType: string;
  base64: string;
};

/** Embute dataUrl nos blocos de imagem para exibição sem depender de download HTTP. */
export function enrichAppointmentDescriptionWithImages(
  description: string,
  savedImages: SavedAppointmentImage[],
): string {
  if (!description.startsWith(APPOINTMENT_DOC_PREFIX)) return description;
  const doc = parseAppointmentDoc(description);
  if (!doc) return description;

  const blocks = doc.blocks.map((block) => {
    if (block.type !== 'image') return block;
    const saved = savedImages[block.fileIndex];
    if (!saved) return block;
    return {
      type: 'image' as const,
      fileIndex: block.fileIndex,
      fileId: saved.fileId,
      dataUrl: `data:${saved.mimeType};base64,${saved.base64}`,
      ...(typeof block.width === 'number' ? { width: block.width } : {}),
    };
  });

  return (
    APPOINTMENT_DOC_PREFIX +
    JSON.stringify({ version: 1, blocks } satisfies AppointmentStoredDoc)
  );
}

export type AppointmentEmailInlineImage = {
  cid: string;
  filename: string;
  content: Buffer;
  contentType: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function stripUnsafeHtml(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe\b[\s\S]*?<\/iframe>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '');
}

function parseDataUrl(dataUrl: string | undefined): {
  mime: string;
  buffer: Buffer;
} | null {
  if (!dataUrl?.startsWith('data:')) return null;
  const match = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl.trim());
  if (!match) return null;
  try {
    const buffer = Buffer.from(match[2], 'base64');
    if (!buffer.length) return null;
    return { mime: match[1].trim() || 'image/png', buffer };
  } catch {
    return null;
  }
}

function extFromMime(mime: string): string {
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  if (mime.includes('png')) return 'png';
  if (mime.includes('gif')) return 'gif';
  if (mime.includes('webp')) return 'webp';
  return 'bin';
}

/** fileIds embutidos nos blocos de imagem (para não anexar em duplicata). */
export function appointmentDocFileIds(description: string): string[] {
  if (!description.startsWith(APPOINTMENT_DOC_PREFIX)) return [];
  const doc = parseAppointmentDoc(description);
  if (!doc) return [];
  return doc.blocks.flatMap((block) =>
    block.type === 'image' && block.fileId ? [block.fileId] : [],
  );
}

/** Completa dataUrl nos blocos de imagem a partir de arquivos já salvos. */
export function hydrateAppointmentDescriptionImages(
  description: string,
  imagesByFileId: Record<string, SavedAppointmentImage>,
): string {
  if (!description.startsWith(APPOINTMENT_DOC_PREFIX)) return description;
  const doc = parseAppointmentDoc(description);
  if (!doc) return description;

  let changed = false;
  const blocks = doc.blocks.map((block) => {
    if (block.type !== 'image' || block.dataUrl || !block.fileId) return block;
    const saved = imagesByFileId[block.fileId];
    if (!saved) return block;
    changed = true;
    return {
      ...block,
      dataUrl: `data:${saved.mimeType};base64,${saved.base64}`,
    };
  });

  if (!changed) return description;
  return (
    APPOINTMENT_DOC_PREFIX +
    JSON.stringify({ version: 1, blocks } satisfies AppointmentStoredDoc)
  );
}

export function appointmentDescriptionToEmailParts(description: string): {
  html: string;
  text: string;
  inlineImages: AppointmentEmailInlineImage[];
} {
  const text = appointmentDescriptionToPlainText(description);
  if (!description.startsWith(APPOINTMENT_DOC_PREFIX)) {
    const raw = description.trim();
    const looksLikeHtml =
      /<(p|div|br|b|i|u|s|ul|ol|li|h[1-4]|a|span|font|img|strong|em)\b/i.test(
        raw,
      );
    const html = looksLikeHtml
      ? stripUnsafeHtml(raw)
      : `<p>${escapeHtml(raw)}</p>`;
    return { html, text, inlineImages: [] };
  }

  const doc = parseAppointmentDoc(description);
  if (!doc) {
    return {
      html: `<p>${escapeHtml(text)}</p>`,
      text,
      inlineImages: [],
    };
  }

  const inlineImages: AppointmentEmailInlineImage[] = [];
  const parts = doc.blocks.map((block, index) => {
    if (block.type === 'text') {
      return stripUnsafeHtml(block.content || '');
    }
    const parsed = parseDataUrl(block.dataUrl);
    if (!parsed) {
      return '<p><em>[imagem]</em></p>';
    }
    const cid = `alleone-img-${index}@portal`;
    inlineImages.push({
      cid,
      filename: `imagem-${index + 1}.${extFromMime(parsed.mime)}`,
      content: parsed.buffer,
      contentType: parsed.mime,
    });
    const width =
      typeof block.width === 'number' && block.width > 0
        ? Math.min(Math.round(block.width), 640)
        : 480;
    return `<p><img src="cid:${cid}" alt="Imagem" width="${width}" style="max-width:100%;height:auto;border-radius:8px"/></p>`;
  });

  return {
    html: parts.join('\n') || `<p>${escapeHtml(text)}</p>`,
    text,
    inlineImages,
  };
}
