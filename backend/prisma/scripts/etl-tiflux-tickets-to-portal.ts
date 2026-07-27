/**
 * ETL idempotente: tiflux.tickets → portal_tickets
 *
 * Uso:
 *   cd backend
 *   npx ts-node prisma/scripts/etl-tiflux-tickets-to-portal.ts
 *   npx ts-node prisma/scripts/etl-tiflux-tickets-to-portal.ts --limit=5000
 *
 * Requer schema tiflux.* populado pelo alleone-tiflux-sync.
 */
import 'dotenv/config';
import { PrismaClient, PortalTicketOrigin } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.split('=')[1]) : 50_000;
  const take = Number.isFinite(limit) && limit > 0 ? limit : 50_000;

  console.log(`ETL tiflux.tickets → portal_tickets (limit=${take})`);

  type Row = {
    ticket_number: number;
    title: string | null;
    client_name: string | null;
    client_external_id: number | null;
    created_by_way_of: string | null;
    priority_name: string | null;
    status_name: string | null;
    stage_name: string | null;
    responsible_external_id: number | null;
    responsible_name: string | null;
    desk_name: string | null;
    desk_external_id: number | null;
    requestor_name: string | null;
    requestor_email: string | null;
    requestor_telephone: string | null;
    is_closed: boolean | null;
    created_at_source: Date | null;
    updated_at_source: Date | null;
  };

  const rows =
    (await prisma.$queryRawUnsafe<Row[]>(
      `
      SELECT
        ticket_number,
        title,
        client_name,
        client_external_id,
        created_by_way_of,
        priority_name,
        status_name,
        stage_name,
        responsible_external_id,
        responsible_name,
        desk_name,
        desk_external_id,
        requestor_name,
        requestor_email,
        requestor_telephone,
        is_closed,
        created_at_source,
        updated_at_source
      FROM tiflux.tickets
      ORDER BY updated_at_source DESC NULLS LAST, ticket_number DESC
      LIMIT $1
    `,
      take,
    )) ?? [];

  console.log(`Lidos ${rows.length} tickets de tiflux.tickets`);

  let upserted = 0;
  for (const row of rows) {
    await prisma.portalTicket.upsert({
      where: { ticketNumber: Number(row.ticket_number) },
      create: {
        ticketNumber: Number(row.ticket_number),
        title: row.title,
        clientName: row.client_name,
        clientExternalId: row.client_external_id,
        createdByWayOf: row.created_by_way_of,
        priorityName: row.priority_name,
        statusName: row.status_name,
        stageName: row.stage_name,
        responsibleExternalId: row.responsible_external_id,
        responsibleName: row.responsible_name,
        deskName: row.desk_name,
        deskExternalId: row.desk_external_id,
        requestorName: row.requestor_name,
        requestorEmail: row.requestor_email,
        requestorTelephone: row.requestor_telephone,
        isClosed: Boolean(row.is_closed),
        origin: PortalTicketOrigin.TIFLUX,
        createdAtSource: row.created_at_source,
        updatedAtSource: row.updated_at_source,
      },
      update: {
        title: row.title,
        clientName: row.client_name,
        clientExternalId: row.client_external_id,
        createdByWayOf: row.created_by_way_of,
        priorityName: row.priority_name,
        statusName: row.status_name,
        stageName: row.stage_name,
        responsibleExternalId: row.responsible_external_id,
        responsibleName: row.responsible_name,
        deskName: row.desk_name,
        deskExternalId: row.desk_external_id,
        requestorName: row.requestor_name,
        requestorEmail: row.requestor_email,
        requestorTelephone: row.requestor_telephone,
        isClosed: Boolean(row.is_closed),
        updatedAtSource: row.updated_at_source,
      },
    });
    upserted += 1;
    if (upserted % 500 === 0) {
      console.log(`… ${upserted}/${rows.length}`);
    }
  }

  console.log(`OK: ${upserted} tickets em portal_tickets`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
