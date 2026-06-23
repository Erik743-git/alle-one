/**
 * Reenfileira apontamentos PORTAL_ONLY de tickets da mesa AlleOne para sync TiFlux.
 * Uso: node scripts/backfill-portal-appointments-sync.mjs [ticketNumber]
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const ticketFilter = process.argv[2] ? Number(process.argv[2]) : null;

function normalizeDeskName(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

function isAlleOneDesk(deskExternalId, deskName) {
  const configuredId = Number(process.env.TIFLUX_PORTAL_DESK_ID);
  const expectedName = normalizeDeskName(
    process.env.TIFLUX_PORTAL_DESK_NAME || 'AlleOne',
  );
  const actualName = normalizeDeskName(deskName);
  const nameMatch = expectedName.length > 0 && actualName === expectedName;
  if (Number.isFinite(configuredId) && configuredId > 0) {
    return Number(deskExternalId) === configuredId || nameMatch;
  }
  return nameMatch;
}

function stripHtml(html) {
  return String(html ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function createTifluxAppointment(ticketNumber, body) {
  const base = process.env.TIFLUX_API_URL?.replace(/\/$/, '');
  const token = process.env.TIFLUX_TOKEN;
  if (!base || !token) {
    throw new Error('TIFLUX_API_URL e TIFLUX_TOKEN são obrigatórios.');
  }
  const res = await fetch(`${base}/tickets/${ticketNumber}/appointments`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  if (!res.ok) {
    throw new Error(
      `TiFlux ${res.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`,
    );
  }
  return data;
}

try {
  if (process.env.TIFLUX_APPOINTMENT_SYNC_ENABLED !== 'true') {
    throw new Error('TIFLUX_APPOINTMENT_SYNC_ENABLED deve ser true.');
  }

  const appointments = await prisma.portalTicketAppointment.findMany({
    where: {
      syncStatus: 'PORTAL_ONLY',
      ...(ticketFilter ? { ticketNumber: ticketFilter } : {}),
    },
    orderBy: { createdAt: 'asc' },
  });

  let enqueued = 0;
  let synced = 0;
  let skipped = 0;
  let failed = 0;

  for (const appt of appointments) {
    const ticketRows =
      await prisma.$queryRaw`SELECT desk_name, desk_external_id FROM tiflux.tickets WHERE ticket_number = ${appt.ticketNumber} LIMIT 1`;
    const ticket = ticketRows[0];
    if (!ticket || !isAlleOneDesk(ticket.desk_external_id, ticket.desk_name)) {
      skipped += 1;
      continue;
    }

    const date = appt.appointmentDate.toISOString().slice(0, 10);
    const payload = {
      portalAppointmentId: appt.id,
      date,
      init_time: appt.initTime,
      end_time: appt.endTime,
      description: stripHtml(appt.description),
      serviceName: appt.serviceName,
      attendance: appt.attendance,
    };

    const outboxId = randomUUID();
    await prisma.$transaction(async (tx) => {
      await tx.portalTifluxOutbox.create({
        data: {
          id: outboxId,
          kind: 'CREATE_APPOINTMENT',
          status: 'PENDING',
          ticketNumber: appt.ticketNumber,
          payload,
          createdBy: appt.createdBy,
        },
      });
      await tx.portalTicketAppointment.update({
        where: { id: appt.id },
        data: {
          syncStatus: 'PENDING_TIFLUX',
          outboxId,
        },
      });
    });
    enqueued += 1;

    try {
      const created = await createTifluxAppointment(appt.ticketNumber, {
        date: payload.date,
        init_time: payload.init_time,
        end_time: payload.end_time,
        description: payload.description,
      });
      const tifluxId = Number(created?.id);
      if (!Number.isFinite(tifluxId) || tifluxId <= 0) {
        throw new Error('TiFlux não retornou ID do apontamento.');
      }
      await prisma.$transaction(async (tx) => {
        await tx.portalTifluxOutbox.update({
          where: { id: outboxId },
          data: {
            status: 'SYNCED',
            tifluxExternalId: tifluxId,
            syncedAt: new Date(),
            errorMessage: null,
          },
        });
        await tx.portalTicketAppointment.update({
          where: { id: appt.id },
          data: {
            syncStatus: 'SYNCED',
            tifluxAppointmentExternalId: tifluxId,
          },
        });
      });
      synced += 1;
      console.log(`OK ticket ${appt.ticketNumber} appt ${appt.id} -> TiFlux ${tifluxId}`);
    } catch (err) {
      failed += 1;
      const message = err instanceof Error ? err.message : String(err);
      await prisma.portalTifluxOutbox.update({
        where: { id: outboxId },
        data: { status: 'FAILED', errorMessage: message.slice(0, 2000) },
      });
      console.error(`FAIL ticket ${appt.ticketNumber} appt ${appt.id}: ${message}`);
    }
  }

  console.log(
    JSON.stringify({ enqueued, synced, failed, skipped, total: appointments.length }, null, 2),
  );
} catch (e) {
  console.error('ERR:', e.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
