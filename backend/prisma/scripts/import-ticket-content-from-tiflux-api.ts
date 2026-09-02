/**
 * Importa descrição + anexos de um ticket direto da API TiFlux → portal.
 *
 * Uso:
 *   cd backend
 *   npx ts-node prisma/scripts/import-ticket-content-from-tiflux-api.ts --ticket=75730
 *   npx ts-node prisma/scripts/import-ticket-content-from-tiflux-api.ts --ticket=75730 --dry-run
 */
import 'dotenv/config';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { writeUploadedBuffer } from '../../src/common/upload/local-file.helper';

const prisma = new PrismaClient();
const uploadsRoot = join(process.cwd(), 'uploads');

type TifluxTicketFile = {
  id: number;
  content_type?: string | null;
  file_name: string;
  size?: number | null;
  url: string;
};

async function resolveFallbackUserId(): Promise<string> {
  const fromEnv = process.env.CUTOVER_ETL_CREATED_BY?.trim();
  if (fromEnv) return fromEnv;

  const admin = await prisma.user.findFirst({
    where: { role: 'ADMIN', deletedAt: null, status: 'ACTIVE' },
    select: { id: true, email: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!admin) {
    throw new Error(
      'Nenhum ADMIN ativo para createdBy. Defina CUTOVER_ETL_CREATED_BY=<userId>.',
    );
  }
  console.log(`Fallback createdBy ADMIN ${admin.email} (${admin.id})`);
  return admin.id;
}

function tifluxBaseUrl(): string {
  return (process.env.TIFLUX_API_URL ?? 'https://api.tiflux.com/api/v2').replace(
    /\/$/,
    '',
  );
}

function tifluxToken(): string {
  const token = process.env.TIFLUX_TOKEN?.trim();
  if (!token) {
    throw new Error('TIFLUX_TOKEN ausente no .env');
  }
  return token;
}

async function tifluxGet<T>(path: string): Promise<T> {
  const res = await fetch(`${tifluxBaseUrl()}${path}`, {
    headers: {
      Authorization: `Bearer ${tifluxToken()}`,
      Accept: 'application/json',
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`TiFlux GET ${path} → ${res.status}: ${text.slice(0, 400)}`);
  }
  return JSON.parse(text) as T;
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180);
}

function tifluxStorageMarker(ticketNumber: number, externalId: number): string {
  return `tickets/${ticketNumber}/tiflux-${externalId}-`;
}

async function portalFileAlreadyImported(
  ticketNumber: number,
  externalId: number,
): Promise<boolean> {
  const marker = tifluxStorageMarker(ticketNumber, externalId);
  const row = await prisma.file.findFirst({
    where: {
      path: { contains: marker },
      deletedAt: null,
      portalTicketAppointmentAttachments: {
        some: { ticketNumber, portalAppointmentId: null },
      },
    },
    select: { id: true },
  });
  return Boolean(row);
}

async function importFile(params: {
  ticketNumber: number;
  externalId: number;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  createdBy: string;
  dryRun: boolean;
}): Promise<boolean> {
  if (await portalFileAlreadyImported(params.ticketNumber, params.externalId)) {
    console.log(`  anexo ${params.externalId} já importado`);
    return false;
  }

  if (params.dryRun) {
    console.log(
      `  [dry-run] anexo ${params.externalId} (${params.fileName}, ${params.buffer.length} bytes)`,
    );
    return true;
  }

  const safeName = sanitizeFileName(params.fileName);
  const relativeKey = `${tifluxStorageMarker(params.ticketNumber, params.externalId)}${safeName}`;
  const storagePath = join(uploadsRoot, relativeKey);
  await writeUploadedBuffer(storagePath, params.buffer);

  const createdFile = await prisma.file.create({
    data: {
      originalName: params.fileName,
      mimeType: params.mimeType,
      path: storagePath,
      size: params.buffer.length,
      uploadedBy: params.createdBy,
    },
  });

  const link = await prisma.portalTicketAppointmentAttachment.create({
    data: {
      ticketNumber: params.ticketNumber,
      portalAppointmentId: null,
      fileId: createdFile.id,
      createdBy: params.createdBy,
    },
  });

  if (params.mimeType.startsWith('image/') && params.buffer.length > 0) {
    await prisma.$executeRaw`
      UPDATE portal_ticket_appointment_attachments
      SET preview_data_base64 = ${params.buffer.toString('base64')}
      WHERE id = ${link.id}
    `;
  }

  console.log(`  anexo importado: ${params.fileName} (${createdFile.id})`);
  return true;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const ticketArg = process.argv.find((a) => a.startsWith('--ticket='));
  const ticketNumber = ticketArg ? Number(ticketArg.split('=')[1]) : NaN;
  if (!Number.isFinite(ticketNumber) || ticketNumber <= 0) {
    throw new Error('Informe --ticket=<número>');
  }

  const portalTicket = await prisma.portalTicket.findUnique({
    where: { ticketNumber },
    select: { ticketNumber: true, title: true },
  });
  if (!portalTicket) {
    throw new Error(`Ticket #${ticketNumber} não existe em portal_tickets`);
  }

  const createdBy = await resolveFallbackUserId();
  const ticketRaw = await tifluxGet<Record<string, unknown>>(`/tickets/${ticketNumber}`);
  const ticket = (ticketRaw.ticket ?? ticketRaw) as Record<string, unknown>;
  const description =
    typeof ticket.description === 'string' ? ticket.description.trim() : '';

  const filesRaw = await tifluxGet<unknown>(`/tickets/${ticketNumber}/files`);
  const files = (Array.isArray(filesRaw) ? filesRaw : []) as TifluxTicketFile[];

  console.log(`Ticket #${ticketNumber}: ${portalTicket.title ?? '—'}`);
  console.log(`Descrição TiFlux: ${description.length} caracteres`);
  console.log(`Anexos TiFlux: ${files.length}`);

  if (!description && files.length === 0) {
    console.log('Nada para importar.');
    return;
  }

  if (description) {
    if (dryRun) {
      console.log(`[dry-run] descrição (${description.length} chars)`);
      console.log(description.slice(0, 400));
    } else {
      await prisma.portalTicketDescription.upsert({
        where: { ticketNumber },
        create: { ticketNumber, description, createdBy },
        update: { description },
      });
      console.log('Descrição gravada em portal_ticket_descriptions');
    }
  }

  let importedFiles = 0;
  for (const file of files) {
    const externalId = Number(file.id);
    if (!Number.isFinite(externalId) || !file.url?.trim()) continue;

    const res = await fetch(file.url);
    if (!res.ok) {
      throw new Error(
        `Download anexo ${externalId} falhou: HTTP ${res.status}`,
      );
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    const imported = await importFile({
      ticketNumber,
      externalId,
      fileName: file.file_name,
      mimeType: file.content_type?.trim() || 'application/octet-stream',
      buffer,
      createdBy,
      dryRun,
    });
    if (imported) importedFiles += 1;
  }

  console.log(
    `Concluído${dryRun ? ' (dry-run)' : ''}: descrição=${description ? 'sim' : 'não'}, anexos novos=${importedFiles}`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
