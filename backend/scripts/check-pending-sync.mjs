import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

try {
  const today = await prisma.portalTicketAppointment.findMany({
    where: {
      appointmentDate: { gte: new Date('2026-06-23T00:00:00.000Z') },
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
      id: true,
      ticketNumber: true,
      syncStatus: true,
      initTime: true,
      endTime: true,
      outboxId: true,
      tifluxAppointmentExternalId: true,
      createdAt: true,
    },
  });
  console.log('today appts:', JSON.stringify(today, null, 2));

  const latestOutbox = await prisma.portalTifluxOutbox.findMany({
    orderBy: { createdAt: 'desc' },
    take: 3,
    select: {
      id: true,
      status: true,
      ticketNumber: true,
      errorMessage: true,
      createdAt: true,
      syncedAt: true,
    },
  });
  console.log('latest outbox:', JSON.stringify(latestOutbox, null, 2));

  const appts = await prisma.portalTicketAppointment.findMany({
    where: { syncStatus: 'PENDING_TIFLUX' },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
      id: true,
      ticketNumber: true,
      initTime: true,
      endTime: true,
      outboxId: true,
      createdAt: true,
    },
  });
  console.log('pending appts:', JSON.stringify(appts, null, 2));

  const outbox = await prisma.portalTifluxOutbox.findMany({
    where: { status: { in: ['PENDING', 'FAILED'] } },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
      id: true,
      status: true,
      ticketNumber: true,
      errorMessage: true,
      createdAt: true,
    },
  });
  console.log('outbox pending/failed:', JSON.stringify(outbox, null, 2));
} finally {
  await prisma.$disconnect();
}
