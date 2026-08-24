/**
 * ETL idempotente: tiflux.tickets → portal_tickets (bulk SQL).
 *
 * Uso:
 *   cd backend
 *   npx ts-node prisma/scripts/etl-tiflux-tickets-to-portal.ts
 *   npx ts-node prisma/scripts/etl-tiflux-tickets-to-portal.ts --limit=5000
 *   npx ts-node prisma/scripts/etl-tiflux-tickets-to-portal.ts --dry-run
 *
 * Seguro com alleone-tiflux-sync ainda rodando: ON CONFLICT atualiza o espelho portal.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.split('=')[1]) : null;
  const dryRun = process.argv.includes('--dry-run');

  const before = await prisma.portalTicket.count();
  let sourceCount = 0;
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ c: number }>>(
      'SELECT count(*)::int AS c FROM tiflux.tickets',
    );
    sourceCount = rows[0]?.c ?? 0;
  } catch (e) {
    throw new Error(
      `Schema tiflux.tickets indisponível: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  console.log(
    `ETL tiflux.tickets → portal_tickets (source=${sourceCount}, portal_antes=${before}${limit ? `, limit=${limit}` : ''}${dryRun ? ', dry-run' : ''})`,
  );

  if (dryRun) {
    console.log('Dry-run: nenhum write.');
    return;
  }

  const sql = limit
    ? `
      INSERT INTO portal_tickets (
        id, ticket_number, title, client_name, client_external_id, created_by_way_of,
        priority_name, status_name, stage_name, responsible_external_id, responsible_name,
        desk_name, desk_external_id, requestor_name, requestor_email, requestor_telephone,
        is_closed, origin, created_at_source, updated_at_source, created_at, updated_at
      )
      SELECT
        gen_random_uuid()::text,
        t.ticket_number,
        t.title,
        t.client_name,
        t.client_external_id,
        t.created_by_way_of,
        t.priority_name,
        t.status_name,
        CASE
          WHEN lower(trim(t.stage_name)) = 'pending'
            OR lower(trim(t.stage_name)) LIKE '%pendente%' THEN 'Pendente'
          WHEN lower(trim(t.stage_name)) LIKE '%aguardando%'
            OR lower(trim(t.stage_name)) LIKE '%waiting%' THEN 'Aguardando usuário'
          WHEN lower(trim(t.stage_name)) LIKE '%execu%'
            OR lower(trim(t.stage_name)) LIKE '%in progress%' THEN 'Em execução'
          ELSE nullif(trim(t.stage_name), '')
        END,
        t.responsible_external_id,
        t.responsible_name,
        t.desk_name,
        t.desk_external_id,
        t.requestor_name,
        t.requestor_email,
        t.requestor_telephone,
        COALESCE(t.is_closed, false),
        'TIFLUX'::"PortalTicketOrigin",
        t.created_at_source,
        t.updated_at_source,
        NOW(),
        NOW()
      FROM (
        SELECT *
        FROM tiflux.tickets
        ORDER BY updated_at_source DESC NULLS LAST, ticket_number DESC
        LIMIT $1
      ) t
      ON CONFLICT (ticket_number) DO UPDATE SET
        title = EXCLUDED.title,
        client_name = EXCLUDED.client_name,
        client_external_id = EXCLUDED.client_external_id,
        created_by_way_of = EXCLUDED.created_by_way_of,
        priority_name = EXCLUDED.priority_name,
        status_name = EXCLUDED.status_name,
        stage_name = EXCLUDED.stage_name,
        responsible_external_id = EXCLUDED.responsible_external_id,
        responsible_name = EXCLUDED.responsible_name,
        desk_name = EXCLUDED.desk_name,
        desk_external_id = EXCLUDED.desk_external_id,
        requestor_name = EXCLUDED.requestor_name,
        requestor_email = EXCLUDED.requestor_email,
        requestor_telephone = EXCLUDED.requestor_telephone,
        is_closed = EXCLUDED.is_closed,
        updated_at_source = EXCLUDED.updated_at_source,
        updated_at = NOW()
    `
    : `
      INSERT INTO portal_tickets (
        id, ticket_number, title, client_name, client_external_id, created_by_way_of,
        priority_name, status_name, stage_name, responsible_external_id, responsible_name,
        desk_name, desk_external_id, requestor_name, requestor_email, requestor_telephone,
        is_closed, origin, created_at_source, updated_at_source, created_at, updated_at
      )
      SELECT
        gen_random_uuid()::text,
        t.ticket_number,
        t.title,
        t.client_name,
        t.client_external_id,
        t.created_by_way_of,
        t.priority_name,
        t.status_name,
        CASE
          WHEN lower(trim(t.stage_name)) = 'pending'
            OR lower(trim(t.stage_name)) LIKE '%pendente%' THEN 'Pendente'
          WHEN lower(trim(t.stage_name)) LIKE '%aguardando%'
            OR lower(trim(t.stage_name)) LIKE '%waiting%' THEN 'Aguardando usuário'
          WHEN lower(trim(t.stage_name)) LIKE '%execu%'
            OR lower(trim(t.stage_name)) LIKE '%in progress%' THEN 'Em execução'
          ELSE nullif(trim(t.stage_name), '')
        END,
        t.responsible_external_id,
        t.responsible_name,
        t.desk_name,
        t.desk_external_id,
        t.requestor_name,
        t.requestor_email,
        t.requestor_telephone,
        COALESCE(t.is_closed, false),
        'TIFLUX'::"PortalTicketOrigin",
        t.created_at_source,
        t.updated_at_source,
        NOW(),
        NOW()
      FROM tiflux.tickets t
      ON CONFLICT (ticket_number) DO UPDATE SET
        title = EXCLUDED.title,
        client_name = EXCLUDED.client_name,
        client_external_id = EXCLUDED.client_external_id,
        created_by_way_of = EXCLUDED.created_by_way_of,
        priority_name = EXCLUDED.priority_name,
        status_name = EXCLUDED.status_name,
        stage_name = EXCLUDED.stage_name,
        responsible_external_id = EXCLUDED.responsible_external_id,
        responsible_name = EXCLUDED.responsible_name,
        desk_name = EXCLUDED.desk_name,
        desk_external_id = EXCLUDED.desk_external_id,
        requestor_name = EXCLUDED.requestor_name,
        requestor_email = EXCLUDED.requestor_email,
        requestor_telephone = EXCLUDED.requestor_telephone,
        is_closed = EXCLUDED.is_closed,
        updated_at_source = EXCLUDED.updated_at_source,
        updated_at = NOW()
    `;

  if (limit) {
    await prisma.$executeRawUnsafe(sql, limit);
  } else {
    await prisma.$executeRawUnsafe(sql);
  }

  // Unifica labels já gravados (Pending / Em Execução / …) — um comando por statement (Prisma prepared).
  await prisma.$executeRawUnsafe(`
    UPDATE portal_tickets SET stage_name = 'Pendente', updated_at = NOW()
    WHERE lower(trim(stage_name)) = 'pending'
       OR (lower(trim(stage_name)) LIKE '%pendente%' AND stage_name IS DISTINCT FROM 'Pendente')
  `);
  await prisma.$executeRawUnsafe(`
    UPDATE portal_tickets SET stage_name = 'Aguardando usuário', updated_at = NOW()
    WHERE lower(trim(stage_name)) LIKE '%aguardando%'
      AND stage_name IS DISTINCT FROM 'Aguardando usuário'
  `);
  await prisma.$executeRawUnsafe(`
    UPDATE portal_tickets SET stage_name = 'Em execução', updated_at = NOW()
    WHERE (lower(trim(stage_name)) LIKE '%execu%' OR lower(trim(stage_name)) LIKE '%in progress%')
      AND stage_name IS DISTINCT FROM 'Em execução'
  `);

  const after = await prisma.portalTicket.count();
  const open = await prisma.portalTicket.count({ where: { isClosed: false } });
  console.log(`Concluído: portal_tickets=${after} (abertos=${open})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
