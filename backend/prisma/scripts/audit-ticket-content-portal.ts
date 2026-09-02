/**
 * Auditoria: descrição + anexos TiFlux (espelho/API) vs portal.
 *
 * Uso:
 *   cd backend
 *   npx ts-node prisma/scripts/audit-ticket-content-portal.ts
 *   npx ts-node prisma/scripts/audit-ticket-content-portal.ts --ticket=75730
 *   npx ts-node prisma/scripts/audit-ticket-content-portal.ts --limit=20
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function dbName(): string {
  return process.env.DATABASE_URL?.split('/').pop()?.split('?')[0] ?? '?';
}

async function mirrorReady(): Promise<boolean> {
  try {
    await prisma.$queryRawUnsafe(`
      SELECT description, content_synced_at
      FROM tiflux.tickets
      LIMIT 1
    `);
    await prisma.$queryRawUnsafe(`
      SELECT external_id
      FROM tiflux.ticket_files
      LIMIT 1
    `);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const ticketArg = process.argv.find((a) => a.startsWith('--ticket='));
  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  const ticketNumber = ticketArg ? Number(ticketArg.split('=')[1]) : null;
  const limit = limitArg ? Number(limitArg.split('=')[1]) : 15;

  console.log(`Banco: ${dbName()}`);
  console.log('');

  const [portalTickets, portalDescriptions, portalAttachments] =
    await Promise.all([
      prisma.portalTicket.count(),
      prisma.portalTicketDescription.count(),
      prisma.portalTicketAppointmentAttachment.count({
        where: { portalAppointmentId: null },
      }),
    ]);

  const portalDescWithText = await prisma.portalTicketDescription.count({
    where: {
      NOT: { description: { equals: '' } },
    },
  });

  console.log('=== Portal ===');
  console.log(`Tickets (portal_tickets):              ${portalTickets}`);
  console.log(`Descrições (portal_ticket_descriptions): ${portalDescriptions} (${portalDescWithText} com texto)`);
  console.log(`Anexos do ticket (sem apontamento):      ${portalAttachments}`);
  console.log('');

  const mirrorOk = await mirrorReady();
  if (!mirrorOk) {
    console.log('=== Espelho TiFlux ===');
    console.log(
      'Indisponível (faltam coluna description ou tabela ticket_files).',
    );
    console.log(
      'Rode: bash deploy/scripts/atualizar-tiflux-sync.sh e aplique o SQL de conteúdo.',
    );
  } else {
    const mirrorStats = await prisma.$queryRawUnsafe<
      Array<{
        total_tickets: number;
        com_descricao: number;
        com_arquivo: number;
      }>
    >(`
      SELECT
        (SELECT count(*)::int FROM tiflux.tickets) AS total_tickets,
        (SELECT count(*)::int FROM tiflux.tickets
          WHERE NULLIF(trim(description), '') IS NOT NULL) AS com_descricao,
        (SELECT count(DISTINCT ticket_number)::int FROM tiflux.ticket_files) AS com_arquivo
    `);
    const filesTotal = await prisma.$queryRawUnsafe<
      Array<{ n: number }>
    >(`SELECT count(*)::int AS n FROM tiflux.ticket_files`);

    console.log('=== Espelho TiFlux ===');
    console.log(`Tickets no espelho:           ${mirrorStats[0]?.total_tickets ?? 0}`);
    console.log(`Com descrição no espelho:   ${mirrorStats[0]?.com_descricao ?? 0}`);
    console.log(`Tickets com arquivo(s):     ${mirrorStats[0]?.com_arquivo ?? 0}`);
    console.log(`Total de arquivos espelho:  ${filesTotal[0]?.n ?? 0}`);
    console.log('');

    const pendingDesc = await prisma.$queryRawUnsafe<
      Array<{ ticket_number: number; desc_len: number; files: number }>
    >(
      `
      SELECT
        t.ticket_number,
        length(coalesce(t.description, '')) AS desc_len,
        (SELECT count(*)::int FROM tiflux.ticket_files tf WHERE tf.ticket_number = t.ticket_number) AS files
      FROM tiflux.tickets t
      WHERE (
        NULLIF(trim(t.description), '') IS NOT NULL
        OR EXISTS (
          SELECT 1 FROM tiflux.ticket_files tf WHERE tf.ticket_number = t.ticket_number
        )
      )
      AND NOT EXISTS (
        SELECT 1 FROM portal_ticket_descriptions d
        WHERE d.ticket_number = t.ticket_number
          AND length(coalesce(d.description, '')) > 0
      )
      ORDER BY t.updated_at_source DESC NULLS LAST, t.ticket_number DESC
      LIMIT ${Number.isFinite(limit) ? limit : 15}
      `,
    );

    console.log(
      `=== Pendente no portal (tem conteúdo no espelho, sem descrição portal) — top ${pendingDesc.length} ===`,
    );
    if (pendingDesc.length === 0) {
      console.log('Nenhum (pelo critério descrição portal vazia).');
    } else {
      for (const row of pendingDesc) {
        console.log(
          `  #${row.ticket_number} — espelho desc=${row.desc_len} chars, arquivos=${row.files}`,
        );
      }
      console.log('');
      console.log(
        'Para importar em lote: npx ts-node prisma/scripts/etl-tiflux-ticket-content-to-portal.ts',
      );
      console.log(
        'Para um ticket via API: npx ts-node prisma/scripts/import-ticket-content-from-tiflux-api.ts --ticket=NUMERO',
      );
    }
  }

  if (ticketNumber != null && Number.isFinite(ticketNumber)) {
    console.log('');
    console.log(`=== Ticket #${ticketNumber} ===`);
    const portal = await prisma.portalTicket.findUnique({
      where: { ticketNumber },
      select: { title: true },
    });
    const desc = await prisma.portalTicketDescription.findUnique({
      where: { ticketNumber },
      select: { description: true },
    });
    const atts = await prisma.portalTicketAppointmentAttachment.count({
      where: { ticketNumber, portalAppointmentId: null },
    });
    console.log(`Título portal: ${portal?.title ?? '—'}`);
    console.log(
      `Descrição portal: ${desc?.description?.length ?? 0} caracteres`,
    );
    console.log(`Anexos portal (ticket): ${atts}`);

    if (mirrorOk) {
      const mirror = await prisma.$queryRawUnsafe<
        Array<{ desc_len: number; files: number }>
      >(
        `
        SELECT
          length(coalesce(description, '')) AS desc_len,
          (SELECT count(*)::int FROM tiflux.ticket_files tf WHERE tf.ticket_number = $1) AS files
        FROM tiflux.tickets
        WHERE ticket_number = $1
        `,
        ticketNumber,
      );
      const m = mirror[0];
      if (m) {
        console.log(`Espelho desc: ${m.desc_len} chars, arquivos: ${m.files}`);
      } else {
        console.log('Ticket ausente no espelho tiflux.tickets');
      }
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
