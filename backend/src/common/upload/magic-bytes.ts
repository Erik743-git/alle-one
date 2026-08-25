/** Detecção de tipo por assinatura (magic bytes). */

export type DetectedUploadKind =
  | 'pdf'
  | 'png'
  | 'jpeg'
  | 'gif'
  | 'webp'
  | 'zip'
  | 'rar'
  | '7z'
  | 'ole'
  | 'text'
  | 'video'
  | 'unknown';

function startsWithBytes(buffer: Buffer, bytes: number[]): boolean {
  if (buffer.length < bytes.length) return false;
  return bytes.every((b, i) => buffer[i] === b);
}

/**
 * Identifica o tipo real do buffer pelos magic bytes.
 * ZIP cobre .zip, .docx, .xlsx e demais OOXML.
 * OLE cobre .doc legado (Compound File).
 */
export function detectUploadKind(
  buffer: Buffer | undefined | null,
): DetectedUploadKind {
  if (!buffer?.length) {
    return 'unknown';
  }

  if (startsWithBytes(buffer, [0x25, 0x50, 0x44, 0x46])) {
    return 'pdf'; // %PDF
  }
  if (
    startsWithBytes(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  ) {
    return 'png';
  }
  if (startsWithBytes(buffer, [0xff, 0xd8, 0xff])) {
    return 'jpeg';
  }
  if (
    startsWithBytes(buffer, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) ||
    startsWithBytes(buffer, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
  ) {
    return 'gif';
  }
  // RIFF....WEBP
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'webp';
  }
  // MP4 / MOV (....ftyp)
  if (buffer.length >= 12 && buffer.toString('ascii', 4, 8) === 'ftyp') {
    return 'video';
  }
  // WebM / Matroska (EBML)
  if (startsWithBytes(buffer, [0x1a, 0x45, 0xdf, 0xa3])) {
    return 'video';
  }
  // AVI (RIFF....AVI )
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 11) === 'AVI'
  ) {
    return 'video';
  }
  // ZIP / OOXML (docx, xlsx, …)
  if (
    startsWithBytes(buffer, [0x50, 0x4b, 0x03, 0x04]) ||
    startsWithBytes(buffer, [0x50, 0x4b, 0x05, 0x06])
  ) {
    return 'zip';
  }
  // RAR 1.5+ / RAR5 ("Rar!")
  if (startsWithBytes(buffer, [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07])) {
    return 'rar';
  }
  // 7z
  if (startsWithBytes(buffer, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])) {
    return '7z';
  }
  // OLE Compound File (.doc, .xls legado)
  if (
    startsWithBytes(buffer, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
  ) {
    return 'ole';
  }

  // Texto: sem null nos primeiros bytes e sem assinaturas de executável
  const sample = buffer.subarray(0, Math.min(buffer.length, 512));
  if (
    !sample.includes(0) &&
    !startsWithBytes(buffer, [0x4d, 0x5a]) && // MZ
    !startsWithBytes(buffer, [0x7f, 0x45, 0x4c, 0x46]) // ELF
  ) {
    return 'text';
  }

  return 'unknown';
}

/** MIME declarados pelo cliente → kinds aceitos no conteúdo. */
const MIME_TO_KINDS: Array<{
  match: (mime: string) => boolean;
  kinds: DetectedUploadKind[];
}> = [
  {
    match: (m) => m === 'application/pdf',
    kinds: ['pdf'],
  },
  {
    match: (m) => m === 'image/png',
    kinds: ['png'],
  },
  {
    match: (m) => m === 'image/jpeg' || m === 'image/jpg',
    kinds: ['jpeg'],
  },
  {
    match: (m) => m === 'image/gif',
    kinds: ['gif'],
  },
  {
    match: (m) => m === 'image/webp',
    kinds: ['webp'],
  },
  {
    match: (m) => m.startsWith('image/'),
    kinds: ['png', 'jpeg', 'gif', 'webp'],
  },
  {
    match: (m) => m.startsWith('video/'),
    kinds: ['video'],
  },
  {
    match: (m) =>
      m === 'application/zip' ||
      m === 'application/x-zip-compressed' ||
      m ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      m ===
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      m ===
        'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
      m.startsWith('application/vnd.openxmlformats-officedocument'),
    kinds: ['zip'],
  },
  {
    match: (m) =>
      m === 'application/vnd.rar' ||
      m === 'application/x-rar-compressed' ||
      m === 'application/x-rar',
    kinds: ['rar'],
  },
  {
    match: (m) => m === 'application/x-7z-compressed' || m === 'application/7z',
    kinds: ['7z'],
  },
  {
    match: (m) =>
      m === 'application/msword' ||
      m === 'application/vnd.ms-excel' ||
      m === 'application/vnd.ms-powerpoint',
    kinds: ['ole'],
  },
  {
    match: (m) => m === 'text/plain' || m.startsWith('text/'),
    kinds: ['text'],
  },
];

export function kindsAllowedForMime(
  mimeType: string,
): DetectedUploadKind[] | null {
  const mime = mimeType.toLowerCase().trim();
  for (const entry of MIME_TO_KINDS) {
    if (entry.match(mime)) {
      return entry.kinds;
    }
  }
  return null;
}

export function mimeMatchesMagicBytes(
  mimeType: string | undefined | null,
  buffer: Buffer | undefined | null,
): boolean {
  const mime = (mimeType || '').toLowerCase().trim();
  if (!mime || !buffer?.length) {
    return false;
  }
  const allowed = kindsAllowedForMime(mime);
  if (!allowed) {
    return false;
  }
  const kind = detectUploadKind(buffer);
  return allowed.includes(kind);
}
