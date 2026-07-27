import { BadRequestException } from '@nestjs/common';
import { mimeMatchesMagicBytes } from './upload/magic-bytes';

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
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument',
  'application/vnd.ms-excel',
  'text/plain',
  'application/zip',
  'application/x-zip-compressed',
] as const;

export type UploadLike = {
  mimetype?: string | null;
  buffer?: Buffer | null;
};

export function assertAllowedUploadMime(mimeType: string | undefined | null) {
  const mime = (mimeType || 'application/octet-stream').toLowerCase();
  const ok = ALLOWED_MIME_PREFIXES.some(
    (prefix) => mime === prefix || mime.startsWith(prefix),
  );
  if (!ok) {
    throw new BadRequestException(
      'Tipo de arquivo não permitido. Use imagem, PDF, documento Office, texto ou ZIP.',
    );
  }
}

/**
 * Valida MIME declarado + conteúdo real (magic bytes).
 * Preferir esta função em todos os uploads com buffer em memória.
 */
export function assertAllowedUpload(file: UploadLike) {
  assertAllowedUploadMime(file.mimetype);
  if (!file.buffer?.length) {
    throw new BadRequestException('Arquivo vazio ou inválido.');
  }
  if (!mimeMatchesMagicBytes(file.mimetype, file.buffer)) {
    throw new BadRequestException(
      'Conteúdo do arquivo não corresponde ao tipo declarado. Envie um arquivo válido.',
    );
  }
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
