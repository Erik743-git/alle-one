import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

try {
  const ticket =
    await prisma.$queryRaw`SELECT ticket_number, desk_name, desk_external_id, stage_name FROM tiflux.tickets WHERE ticket_number = 72713 LIMIT 1`;
  console.log('ticket:', JSON.stringify(ticket, null, 2));

  const appts =
    await prisma.$queryRaw`SELECT id, sync_status, outbox_id, init_time, end_time, service_name FROM portal_ticket_appointments WHERE ticket_number = 72713 ORDER BY created_at DESC LIMIT 5`;
  console.log('appts:', JSON.stringify(appts, null, 2));

  const outbox =
    await prisma.$queryRaw`SELECT id, status, error_message, ticket_number, created_at FROM portal_tiflux_outbox WHERE ticket_number = 72713 ORDER BY created_at DESC LIMIT 5`;
  console.log('outbox:', JSON.stringify(outbox, null, 2));
} catch (e) {
  console.error('ERR:', e.message);
} finally {
  await prisma.$disconnect();
}
