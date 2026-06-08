import { BadRequestException } from '@nestjs/common';

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
  'text/plain',
  'application/zip',
  'application/x-zip-compressed',
] as const;

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
