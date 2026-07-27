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
};

@Injectable()
export class TicketsPortalStoreService {
  constructor(private readonly prisma: PrismaService) {}

  /** Próximo número para tickets criados só no portal. */
  async allocatePortalTicketNumber(): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ n: bigint | number }>>`
      SELECT nextval('portal_ticket_number_seq') AS n
    `;
    return Number(rows[0]?.n);
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
        updatedAtSource: data.updatedAtSource,
      },
    });
  }

  async patchStage(ticketNumber: number, stageName: string) {
    return this.prisma.portalTicket.updateMany({
      where: { ticketNumber },
      data: {
        stageName,
        updatedAtSource: new Date(),
      },
    });
  }
}
