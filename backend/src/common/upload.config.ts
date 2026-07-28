import { BadRequestException } from '@nestjs/common';
import {
  detectUploadKind,
  mimeMatchesMagicBytes,
  type DetectedUploadKind,
} from './upload/magic-bytes';

/** Limite padrão de upload multipart (10 MB). */
export const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

/** Anexos de apontamento no portal (até 25 MB, como TiFlux). */
export const TICKET_APPOINTMENT_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;

export const multerMemoryLimits = {
  limits: { fileSize: UPLOAD_MAX_BYTES },
} as const;

export const ticketAppointmentUploadLimits = {
  limits: { fileSize: TICKET_APPOINTMENT_UPLOAD_MAX_BYTES },
} as const;

const ALLOWED_MIME_PREFIXES = [
  'image/',
  'text/',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'application/vnd.ms-office',
  'application/zip',
  'application/x-zip-compressed',
  'application/vnd.rar',
  'application/x-rar-compressed',
  'application/x-rar',
  'application/x-7z-compressed',
  'application/7z',
  'application/json',
  'application/xml',
] as const;

/** Extensões liberadas (fallback quando o browser manda MIME genérico). */
const ALLOWED_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.bmp',
  '.pdf',
  '.txt',
  '.csv',
  '.log',
  '.json',
  '.xml',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.zip',
  '.rar',
  '.7z',
]);

const EXTENSION_TO_KINDS: Record<string, DetectedUploadKind[]> = {
  '.png': ['png'],
  '.jpg': ['jpeg'],
  '.jpeg': ['jpeg'],
  '.gif': ['gif'],
  '.webp': ['webp'],
  '.pdf': ['pdf'],
  '.txt': ['text'],
  '.csv': ['text'],
  '.log': ['text'],
  '.json': ['text'],
  '.xml': ['text'],
  '.doc': ['ole'],
  '.xls': ['ole'],
  '.ppt': ['ole'],
  '.docx': ['zip'],
  '.xlsx': ['zip'],
  '.pptx': ['zip'],
  '.zip': ['zip'],
  '.rar': ['rar'],
  '.7z': ['7z'],
};

/** Tipos detectáveis por magic bytes quando o browser manda octet-stream. */
const OCTET_STREAM_SAFE_KINDS = new Set<DetectedUploadKind>([
  'zip',
  'rar',
  '7z',
  'pdf',
  'png',
  'jpeg',
  'gif',
  'webp',
  'ole',
  'text',
]);

export type UploadLike = {
  mimetype?: string | null;
  buffer?: Buffer | null;
  originalname?: string | null;
};

const UPLOAD_TYPE_HINT =
  'Tipo de arquivo não permitido. Use imagem, PDF, Word, Excel, PowerPoint, texto, ZIP, RAR ou 7z.';

function fileExtension(name: string | null | undefined): string {
  const base = (name || '').trim().toLowerCase();
  const idx = base.lastIndexOf('.');
  if (idx < 0) return '';
  return base.slice(idx);
}

export function assertAllowedUploadMime(mimeType: string | undefined | null) {
  const mime = (mimeType || 'application/octet-stream').toLowerCase();
  const ok = ALLOWED_MIME_PREFIXES.some(
    (prefix) => mime === prefix || mime.startsWith(prefix),
  );
  if (!ok) {
    throw new BadRequestException(UPLOAD_TYPE_HINT);
  }
}

/**
 * Valida MIME declarado + conteúdo real (magic bytes).
 * Preferir esta função em todos os uploads com buffer em memória.
 */
export function assertAllowedUpload(file: UploadLike) {
  if (!file.buffer?.length) {
    throw new BadRequestException('Arquivo vazio ou inválido.');
  }

  const mime = (file.mimetype || '').toLowerCase().trim();
  const ext = fileExtension(file.originalname);
  const kind = detectUploadKind(file.buffer);

  const mimeAllowed = ALLOWED_MIME_PREFIXES.some(
    (prefix) => mime === prefix || mime.startsWith(prefix),
  );

  if (mimeAllowed) {
    if (!mimeMatchesMagicBytes(mime, file.buffer)) {
      throw new BadRequestException(
        'Conteúdo do arquivo não corresponde ao tipo declarado. Envie um arquivo válido.',
      );
    }
    return;
  }

  // Chrome/Edge costumam enviar .rar/.7z/.txt como application/octet-stream.
  if (mime === 'application/octet-stream' || !mime) {
    if (OCTET_STREAM_SAFE_KINDS.has(kind)) {
      return;
    }
  }

  // Fallback por extensão + assinatura do arquivo (ex.: .rar com MIME estranho).
  if (ext && ALLOWED_EXTENSIONS.has(ext)) {
    const expected = EXTENSION_TO_KINDS[ext];
    if (!expected || expected.includes(kind)) {
      return;
    }
    // .bmp e similares sem detector específico: só imagem genérica sem MZ/ELF
    if (ext === '.bmp' && kind === 'unknown') {
      return;
    }
  }

  throw new BadRequestException(UPLOAD_TYPE_HINT);
}

/** Planilha Excel (.xlsx = ZIP/OOXML) para importação de inventário. */
export function assertInventoryImportUpload(file: UploadLike) {
  if (!file.buffer?.length) {
    throw new BadRequestException('Envie um arquivo Excel (.xlsx).');
  }
  const mime = (file.mimetype || '').toLowerCase();
  const mimeOk =
    !mime ||
    mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mime === 'application/zip' ||
    mime === 'application/octet-stream' ||
    mime.includes('spreadsheet') ||
    mime.includes('excel');
  if (!mimeOk) {
    throw new BadRequestException('Envie um arquivo Excel (.xlsx).');
  }
  if (!mimeMatchesMagicBytes(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    file.buffer,
  )) {
    throw new BadRequestException(
      'Arquivo inválido: esperado Excel (.xlsx).',
    );
  }
}
