/**
 * ETL idempotente: espelho TiFlux (descrição + anexos) → portal_ticket_descriptions + files.
 *
 * Pré-requisito: alleone-tiflux-sync com colunas/tabelas de conteúdo
 * (`tiflux.tickets.description`, `tiflux.ticket_files`) populadas.
 *
 * Uso:
 *   cd backend
 *   npx ts-node prisma/scripts/etl-tiflux-ticket-content-to-portal.ts
 *   npx ts-node prisma/scripts/etl-tiflux-ticket-content-to-portal.ts --dry-run
 *   npx ts-node prisma/scripts/etl-tiflux-ticket-content-to-portal.ts --limit=500
 *   npx ts-node prisma/scripts/etl-tiflux-ticket-content-to-portal.ts --ticket=75730
 *   npx ts-node prisma/scripts/etl-tiflux-ticket-content-to-portal.ts --refresh
 */
import 'dotenv/config';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { writeUploadedBuffer } from '../../src/common/upload/local-file.helper';

const prisma = new PrismaClient();
const uploadsRoot = join(process.cwd(), 'uploads');

type MirrorTicketRow = {
  ticket_number: number;
  description: string | null;
  raw_description: string | null;
};

type MirrorFileRow = {
  ticket_number: number;
  external_id: number;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  file_data: Buffer;
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
      'Nenhum ADMIN ativo para createdBy do ETL. Defina CUTOVER_ETL_CREATED_BY=<userId>.',
    );
  }
  console.log(`Fallback createdBy ADMIN ${admin.email} (${admin.id})`);
  return admin.id;
}

async function mirrorSchemaReady(): Promise<boolean> {
  try {
    await prisma.$queryRawUnsafe(`
      SELECT description, content_synced_at
      FROM tiflux.tickets
      LIMIT 1
    `);
    await prisma.$queryRawUnsafe(`
      SELECT external_id, file_data
      FROM tiflux.ticket_files
      LIMIT 1
    `);
    return true;
  } catch {
    return false;
  }
}

async function loadMirrorTickets(params: {
  limit: number | null;
  ticketNumber: number | null;
}): Promise<MirrorTicketRow[]> {
  const ticketFilter = params.ticketNumber
    ? `AND t.ticket_number = ${Number(params.ticketNumber)}`
    : '';
  const limitSql = params.limit ? `LIMIT ${Number(params.limit)}` : '';

  return prisma.$queryRawUnsafe<MirrorTicketRow[]>(`
    SELECT
      t.ticket_number,
      NULLIF(trim(t.description), '') AS description,
      NULLIF(trim(t.raw_json->>'description'), '') AS raw_description
    FROM tiflux.tickets t
    WHERE (
      NULLIF(trim(t.description), '') IS NOT NULL
      OR NULLIF(trim(t.raw_json->>'description'), '') IS NOT NULL
      OR EXISTS (
        SELECT 1
        FROM tiflux.ticket_files tf
        WHERE tf.ticket_number = t.ticket_number
      )
    )
    ${ticketFilter}
    ORDER BY t.updated_at_source DESC NULLS LAST, t.ticket_number DESC
    ${limitSql}
  `);
}

async function loadMirrorFiles(ticketNumber: number): Promise<MirrorFileRow[]> {
  return prisma.$queryRawUnsafe<MirrorFileRow[]>(
    `
    SELECT
      ticket_number,
      external_id,
      file_name,
      mime_type,
      size_bytes,
      file_data
    FROM tiflux.ticket_files
    WHERE ticket_number = $1
    ORDER BY external_id ASC
    `,
    ticketNumber,
  );
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

async function importMirrorFile(params: {
  ticketNumber: number;
  externalId: number;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  createdBy: string;
  dryRun: boolean;
}): Promise<void> {
  if (await portalFileAlreadyImported(params.ticketNumber, params.externalId)) {
    return;
  }

  if (params.dryRun) {
    console.log(
      `  [dry-run] anexo tiflux ${params.externalId} (${params.fileName}) ticket ${params.ticketNumber}`,
    );
    return;
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
}

async function importTicketContent(params: {
  row: MirrorTicketRow;
  createdBy: string;
  dryRun: boolean;
  refresh: boolean;
}): Promise<{ descriptionImported: boolean; filesImported: number }> {
  const ticketNumber = Number(params.row.ticket_number);
  const description =
    params.row.description?.trim() ||
    params.row.raw_description?.trim() ||
    '';

  const existing = await prisma.portalTicketDescription.findUnique({
    where: { ticketNumber },
    select: { ticketNumber: true },
  });

  let descriptionImported = false;
  if (description && (!existing || params.refresh)) {
    if (params.dryRun) {
      console.log(
        `[dry-run] descrição ticket ${ticketNumber} (${description.length} chars)`,
      );
    } else {
      await prisma.portalTicketDescription.upsert({
        where: { ticketNumber },
        create: {
          ticketNumber,
          description,
          createdBy: params.createdBy,
        },
        update: {
          description,
        },
      });
    }
    descriptionImported = true;
  }

  const mirrorFiles = await loadMirrorFiles(ticketNumber);
  let filesImported = 0;
  for (const file of mirrorFiles) {
    const buffer = Buffer.isBuffer(file.file_data)
      ? file.file_data
      : Buffer.from(file.file_data);
    if (!buffer.length) continue;

    const before = await portalFileAlreadyImported(
      ticketNumber,
      Number(file.external_id),
    );
    await importMirrorFile({
      ticketNumber,
      externalId: Number(file.external_id),
      fileName: file.file_name,
      mimeType: file.mime_type?.trim() || 'application/octet-stream',
      buffer,
      createdBy: params.createdBy,
      dryRun: params.dryRun,
    });
    if (!before) filesImported += 1;
  }

  return { descriptionImported, filesImported };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const refresh = process.argv.includes('--refresh');
  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  const ticketArg = process.argv.find((a) => a.startsWith('--ticket='));
  const limit = limitArg ? Number(limitArg.split('=')[1]) : null;
  const ticketNumber = ticketArg ? Number(ticketArg.split('=')[1]) : null;

  if (!(await mirrorSchemaReady())) {
    throw new Error(
      'Espelho sem tabelas/colunas de conteúdo (tiflux.tickets.description / tiflux.ticket_files). ' +
        'Rode: bash deploy/scripts/deploy-ticket-content-prod.sh (aplica o SQL) ou atualizar-tiflux-sync.sh. ' +
        'Depois aguarde o alleone-tiflux-sync popular description e ticket_files.',
    );
  }

  const createdBy = await resolveFallbackUserId();
  const tickets = await loadMirrorTickets({ limit, ticketNumber });

  console.log(
    `ETL conteúdo TiFlux → portal (${tickets.length} tickets${dryRun ? ', dry-run' : ''}${refresh ? ', refresh' : ''})`,
  );

  let descriptions = 0;
  let files = 0;
  for (const row of tickets) {
    const result = await importTicketContent({
      row,
      createdBy,
      dryRun,
      refresh,
    });
    descriptions += result.descriptionImported ? 1 : 0;
    files += result.filesImported;
  }

  const portalDescriptions = await prisma.portalTicketDescription.count();
  const portalTicketFiles = await prisma.portalTicketAppointmentAttachment.count({
    where: { portalAppointmentId: null },
  });

  console.log(
    `Concluído: importados agora descrições=${descriptions}, arquivos=${files}; portal total descrições=${portalDescriptions}, anexos-ticket=${portalTicketFiles}`,
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
