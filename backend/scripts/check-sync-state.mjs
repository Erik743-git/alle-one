import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

try {
  const syncState =
    await prisma.$queryRaw`
      select entity_name, status, last_success_at, last_source_updated_at, updated_at
      from tiflux.sync_state
      order by entity_name
    `;
  const [tickets] =
    await prisma.$queryRaw`
      select
        count(*)::int as total,
        max(updated_at) as max_row_updated,
        max(synced_at) as max_synced_at,
        max(updated_at_source) as max_source_updated
      from tiflux.tickets
    `;
  const [duplicates] =
    await prisma.$queryRaw`
      select count(*)::int as groups_with_dup
      from (
        select ticket_number
        from tiflux.tickets
        group by ticket_number
        having count(*) > 1
      ) x
    `;
  const recent =
    await prisma.$queryRaw`
      select ticket_number, title, synced_at, updated_at_source, created_at_source
      from tiflux.tickets
      order by coalesce(updated_at_source, created_at_source, synced_at) desc nulls last
      limit 5
    `;
  const sample =
    await prisma.$queryRaw`
      select ticket_number, synced_at, updated_at_source
      from tiflux.tickets
      where ticket_number in (72713, 70637, 64095)
      order by ticket_number
    `;

  console.log(
    JSON.stringify(
      {
        syncState,
        tickets,
        duplicates,
        recentTickets: recent,
        sampleTickets: sample,
        now: new Date().toISOString(),
      },
      (_k, v) => (v instanceof Date ? v.toISOString() : v),
      2,
    ),
  );
} finally {
  await prisma.$disconnect();
}
