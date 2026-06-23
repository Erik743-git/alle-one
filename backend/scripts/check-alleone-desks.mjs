import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

try {
  const desks =
    await prisma.$queryRaw`SELECT DISTINCT desk_name, desk_external_id, COUNT(*)::int AS tickets FROM tiflux.tickets WHERE lower(trim(desk_name)) LIKE '%alle%' GROUP BY desk_name, desk_external_id ORDER BY tickets DESC`;
  console.log('alle desks:', JSON.stringify(desks, null, 2));

  const envDeskId = process.env.TIFLUX_PORTAL_DESK_ID;
  console.log('TIFLUX_PORTAL_DESK_ID env:', envDeskId ?? '(not set)');
  console.log('TIFLUX_APPOINTMENT_SYNC_ENABLED:', process.env.TIFLUX_APPOINTMENT_SYNC_ENABLED ?? '(not set)');
} catch (e) {
  console.error('ERR:', e.message);
} finally {
  await prisma.$disconnect();
}
