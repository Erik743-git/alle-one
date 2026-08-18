import { Injectable } from '@nestjs/common';
import { PortalTicketOrigin, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type UpsertPortalTicketInput = {
  ticketNumber: number;
  title?: string | null;
  clientName?: string | null;
  clientExternalId?: number | null;
  createdByWayOf?: string | null;
  priorityName?: string | null;
  statusName?: string | null;
  stageName?: string | null;
  responsibleExternalId?: number | null;
  responsibleName?: string | null;
  deskName?: string | null;
  deskExternalId?: number | null;
  requestorName?: string | null;
  requestorEmail?: string | null;
  requestorTelephone?: string | null;
  isClosed?: boolean;
  origin?: PortalTicketOrigin;
  createdAtSource?: Date | null;
  updatedAtSource?: Date | null;
  createdBy?: string | null;
  specialtyId?: string | null;
  emailConversationId?: string | null;
  parentTicketNumber?: number | null;
};

@Injectable()
export class TicketsPortalStoreService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Próximo número = MAX(ticket_number)+1 entre tickets “normais” (< 1e9),
   * para continuar a sequência após o último chamado (TiFlux/portal).
   * A faixa ≥ 1000000000 era legado do cutover e não deve pular a sequência.
   */
  async allocatePortalTicketNumber(): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ n: bigint | number }>>`
      SELECT COALESCE(
        (
          SELECT MAX(ticket_number)
          FROM portal_tickets
          WHERE ticket_number < 1000000000
        ),
        0
      ) + 1 AS n
    `;
    let next = Number(rows[0]?.n);
    if (!Number.isFinite(next) || next < 1) {
      next = 1;
    }

    // Evita colisão se o número já existir (ex.: sync paralelo).
    for (let i = 0; i < 20; i++) {
      const exists = await this.prisma.portalTicket.findUnique({
        where: { ticketNumber: next },
        select: { ticketNumber: true },
      });
      if (!exists) break;
      next += 1;
    }

    await this.prisma.$executeRaw`
      SELECT setval(
        'portal_ticket_number_seq',
        GREATEST(
          ${next},
          COALESCE((SELECT MAX(ticket_number) FROM portal_tickets), 0)
        )
      )
    `;

    return next;
  }

  async upsertByTicketNumber(input: UpsertPortalTicketInput) {
    const data: Prisma.PortalTicketUncheckedCreateInput = {
      ticketNumber: input.ticketNumber,
      title: input.title ?? null,
      clientName: input.clientName ?? null,
      clientExternalId: input.clientExternalId ?? null,
      createdByWayOf: input.createdByWayOf ?? null,
      priorityName: input.priorityName ?? null,
      statusName: input.statusName ?? null,
      stageName: input.stageName ?? null,
      responsibleExternalId: input.responsibleExternalId ?? null,
      responsibleName: input.responsibleName ?? null,
      deskName: input.deskName ?? null,
      deskExternalId: input.deskExternalId ?? null,
      requestorName: input.requestorName ?? null,
      requestorEmail: input.requestorEmail ?? null,
      requestorTelephone: input.requestorTelephone ?? null,
      isClosed: input.isClosed ?? false,
      origin: input.origin ?? PortalTicketOrigin.TIFLUX,
      specialtyId: input.specialtyId ?? null,
      emailConversationId: input.emailConversationId ?? null,
      createdAtSource: input.createdAtSource ?? null,
      updatedAtSource: input.updatedAtSource ?? new Date(),
      createdBy: input.createdBy ?? null,
    };

    return this.prisma.portalTicket.upsert({
      where: { ticketNumber: input.ticketNumber },
      create: data,
      update: {
        title: data.title,
        clientName: data.clientName,
        clientExternalId: data.clientExternalId,
        createdByWayOf: data.createdByWayOf,
        priorityName: data.priorityName,
        statusName: data.statusName,
        stageName: data.stageName,
        responsibleExternalId: data.responsibleExternalId,
        responsibleName: data.responsibleName,
        deskName: data.deskName,
        deskExternalId: data.deskExternalId,
        requestorName: data.requestorName,
        requestorEmail: data.requestorEmail,
        requestorTelephone: data.requestorTelephone,
        isClosed: data.isClosed,
        ...(input.specialtyId !== undefined
          ? { specialtyId: input.specialtyId }
          : {}),
        ...(input.emailConversationId !== undefined
          ? { emailConversationId: input.emailConversationId }
          : {}),
        ...(input.parentTicketNumber !== undefined
          ? { parentTicketNumber: input.parentTicketNumber }
          : {}),
        updatedAtSource: data.updatedAtSource,
      },
    });
  }

  async patchStage(
    ticketNumber: number,
    stageName: string,
    opts?: { isClosed?: boolean },
  ) {
    return this.prisma.portalTicket.updateMany({
      where: { ticketNumber },
      data: {
        stageName,
        ...(opts?.isClosed !== undefined ? { isClosed: opts.isClosed } : {}),
        updatedAtSource: new Date(),
      },
    });
  }
}
