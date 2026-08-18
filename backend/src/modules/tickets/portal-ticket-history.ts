import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedRequestUser } from '../auth/auth-request-user';

export async function actorDisplayName(
  prisma: PrismaService,
  actor: AuthenticatedRequestUser,
): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: actor.userId },
    select: { name: true },
  });
  const name = user?.name?.trim();
  return name || actor.email;
}

export function formatYmdBr(ymd: string | null | undefined): string {
  if (!ymd?.trim()) return '—';
  const [y, m, d] = ymd.trim().slice(0, 10).split('-');
  if (!y || !m || !d) return ymd;
  return `${d}/${m}/${y}`;
}

export function appointmentHistoryLabel(params: {
  date: string | null | undefined;
  initTime: string | null | undefined;
  endTime: string | null | undefined;
}): string {
  return `${formatYmdBr(params.date)} ${params.initTime ?? '—'}–${params.endTime ?? '—'}`;
}

export async function recordPortalTicketHistory(
  prisma: PrismaService,
  params: {
    ticketNumber: number;
    eventType: string;
    summary: string;
    actorName: string | null;
    externalKey?: string;
    payload?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await prisma.ticketHistory.create({
      data: {
        ticketNumber: params.ticketNumber,
        eventType: params.eventType,
        summary: params.summary,
        actorName: params.actorName,
        source: 'PORTAL',
        externalKey:
          params.externalKey ??
          `${params.eventType.toLowerCase()}:${params.ticketNumber}:${Date.now()}`,
        payload: (params.payload ?? undefined) as
          | Prisma.InputJsonValue
          | undefined,
        occurredAt: new Date(),
      },
    });
  } catch {
    // Histórico não deve bloquear a operação principal.
  }
}
