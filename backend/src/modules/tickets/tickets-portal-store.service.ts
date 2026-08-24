import { Injectable } from '@nestjs/common';
import { PortalTicketOrigin, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { fitsPrismaInt4 } from './portal-responsible.helper';

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
  isPreTicket?: boolean;
  becamePreTicketAt?: Date | null;
  createdAtSource?: Date | null;
  updatedAtSource?: Date | null;
  createdBy?: string | null;
  specialtyId?: string | null;
  classificationId?: string | null;
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

    if (!Number.isSafeInteger(next) || next < 1 || next > 2147483646) {
      throw new Error(
        'Não foi possível gerar um número de chamado válido. Contate o suporte.',
      );
    }

    // Não usa MAX(ticket_number) da tabela inteira: números de cutover (≥ 1e9)
    // ou lixo fora de INT4 derrubavam o setval e a abertura do chamado.
    try {
      await this.prisma.$executeRaw`
        SELECT setval('portal_ticket_number_seq', ${next}::bigint)
      `;
    } catch {
      // Sequence ausente ou incompatível — o número já foi escolhido acima.
    }

    return next;
  }

  async upsertByTicketNumber(input: UpsertPortalTicketInput) {
    if (!fitsPrismaInt4(input.ticketNumber)) {
      throw new Error(
        `Número de chamado ${input.ticketNumber} não cabe no cadastro. Tente novamente.`,
      );
    }
    const responsibleExternalId =
      input.responsibleExternalId != null &&
      fitsPrismaInt4(input.responsibleExternalId)
        ? input.responsibleExternalId
        : null;
    const clientExternalId =
      input.clientExternalId != null && fitsPrismaInt4(input.clientExternalId)
        ? input.clientExternalId
        : null;
    const deskExternalId =
      input.deskExternalId != null && fitsPrismaInt4(input.deskExternalId)
        ? input.deskExternalId
        : null;

    const data: Prisma.PortalTicketUncheckedCreateInput = {
      ticketNumber: input.ticketNumber,
      title: input.title ?? null,
      clientName: input.clientName ?? null,
      clientExternalId,
      createdByWayOf: input.createdByWayOf ?? null,
      priorityName: input.priorityName ?? null,
      statusName: input.statusName ?? null,
      stageName: input.stageName ?? null,
      responsibleExternalId,
      responsibleName: input.responsibleName ?? null,
      deskName: input.deskName ?? null,
      deskExternalId,
      requestorName: input.requestorName ?? null,
      requestorEmail: input.requestorEmail ?? null,
      requestorTelephone: input.requestorTelephone ?? null,
      isClosed: input.isClosed ?? false,
      origin: input.origin ?? PortalTicketOrigin.TIFLUX,
      isPreTicket: input.isPreTicket ?? false,
      becamePreTicketAt: input.becamePreTicketAt ?? null,
      specialtyId: input.specialtyId ?? null,
      classificationId: input.classificationId ?? null,
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
        ...(input.isPreTicket !== undefined
          ? { isPreTicket: input.isPreTicket }
          : {}),
        ...(input.becamePreTicketAt !== undefined
          ? { becamePreTicketAt: input.becamePreTicketAt }
          : {}),
        ...(input.specialtyId !== undefined
          ? { specialtyId: input.specialtyId }
          : {}),
        ...(input.classificationId !== undefined
          ? { classificationId: input.classificationId }
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
