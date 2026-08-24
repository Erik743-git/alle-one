import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PermissionsService } from '../permissions/permissions.service';
import { TicketsService } from '../tickets/tickets.service';
import type { AuthenticatedRequestUser } from '../auth/auth-request-user';
import type { CreateTicketDto } from '../tickets/tickets-create.dto';
import {
  CreateTicketAutoOpenRuleDto,
  UpdateTicketAutoOpenRuleDto,
} from './ticket-auto-open.dto';
import {
  advanceScheduledDate,
  formatYmdUtc,
  parseRuleDueAt,
  TICKET_AUTO_OPEN_PERIODICITY_LABELS,
} from './ticket-auto-open.helper';

export type TicketAutoOpenRuleDto = {
  id: string;
  name: string;
  active: boolean;
  periodicity: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  periodicityLabel: string;
  nextScheduledDate: string;
  scheduleTime: string;
  deskExternalId: number;
  clientExternalId: number;
  responsibleExternalId: number | null;
  priorityExternalId: number | null;
  servicesCatalogsItemId: number | null;
  classificationId: string | null;
  title: string;
  description: string;
  requestorName: string;
  requestorEmail: string;
  requestorTelephone: string | null;
  requestorExternalId: number | null;
  externalGmudRef: string | null;
  ccEmails: string[];
  parentTicketNumber: number | null;
  lastRunAt: string | null;
  lastTicketNumber: number | null;
  createdAt: string;
};

@Injectable()
export class TicketAutoOpenService {
  private readonly logger = new Logger(TicketAutoOpenService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ticketsService: TicketsService,
    private readonly permissionsService: PermissionsService,
  ) {}

  private map(row: {
    id: string;
    name: string;
    active: boolean;
    periodicity: 'DAILY' | 'WEEKLY' | 'MONTHLY';
    nextScheduledDate: Date;
    scheduleTime: string;
    deskExternalId: number;
    clientExternalId: number;
    responsibleExternalId: number | null;
    priorityExternalId: number | null;
    servicesCatalogsItemId: number | null;
    classificationId: string | null;
    title: string;
    description: string;
    requestorName: string;
    requestorEmail: string;
    requestorTelephone: string | null;
    requestorExternalId: number | null;
    externalGmudRef: string | null;
    ccEmails: string[];
    parentTicketNumber: number | null;
    lastRunAt: Date | null;
    lastTicketNumber: number | null;
    createdAt: Date;
  }): TicketAutoOpenRuleDto {
    return {
      id: row.id,
      name: row.name,
      active: row.active,
      periodicity: row.periodicity,
      periodicityLabel: TICKET_AUTO_OPEN_PERIODICITY_LABELS[row.periodicity],
      nextScheduledDate: formatYmdUtc(row.nextScheduledDate),
      scheduleTime: row.scheduleTime,
      deskExternalId: row.deskExternalId,
      clientExternalId: row.clientExternalId,
      responsibleExternalId: row.responsibleExternalId,
      priorityExternalId: row.priorityExternalId,
      servicesCatalogsItemId: row.servicesCatalogsItemId,
      classificationId: row.classificationId,
      title: row.title,
      description: row.description,
      requestorName: row.requestorName,
      requestorEmail: row.requestorEmail,
      requestorTelephone: row.requestorTelephone,
      requestorExternalId: row.requestorExternalId,
      externalGmudRef: row.externalGmudRef,
      ccEmails: row.ccEmails ?? [],
      parentTicketNumber: row.parentTicketNumber,
      lastRunAt: row.lastRunAt?.toISOString() ?? null,
      lastTicketNumber: row.lastTicketNumber,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private normalizeDto(dto: CreateTicketAutoOpenRuleDto) {
    const ccEmails = (dto.ccEmails ?? [])
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);
    return {
      name: dto.name.trim(),
      active: dto.active ?? true,
      periodicity: dto.periodicity,
      nextScheduledDate: new Date(`${dto.nextScheduledDate}T12:00:00.000Z`),
      scheduleTime: dto.scheduleTime.trim(),
      deskExternalId: dto.deskId,
      clientExternalId: dto.clientId,
      responsibleExternalId:
        dto.responsibleId === null || dto.responsibleId === undefined
          ? null
          : dto.responsibleId,
      priorityExternalId: dto.priorityId ?? null,
      servicesCatalogsItemId: dto.servicesCatalogsItemId ?? null,
      classificationId: dto.classificationId?.trim() || null,
      title: dto.title.trim(),
      description: dto.description.trim(),
      requestorName: dto.requestorName.trim(),
      requestorEmail: dto.requestorEmail.trim(),
      requestorTelephone: dto.requestorTelephone?.trim() || null,
      requestorExternalId: dto.requestorId ?? null,
      externalGmudRef: dto.externalGmudRef?.trim() || null,
      ccEmails,
      parentTicketNumber: dto.parentTicketNumber ?? null,
    };
  }

  async list(): Promise<TicketAutoOpenRuleDto[]> {
    const rows = await this.prisma.ticketAutoOpenRule.findMany({
      where: { deletedAt: null },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });
    return rows.map((row) => this.map(row));
  }

  async create(
    actor: AuthenticatedRequestUser,
    dto: CreateTicketAutoOpenRuleDto,
  ): Promise<TicketAutoOpenRuleDto> {
    const data = this.normalizeDto(dto);
    if (!data.name) throw new BadRequestException('Informe o nome da regra.');

    const created = await this.prisma.ticketAutoOpenRule.create({
      data: {
        ...data,
        createdBy: actor.userId,
      },
    });
    return this.map(created);
  }

  async update(
    id: string,
    dto: UpdateTicketAutoOpenRuleDto,
  ): Promise<TicketAutoOpenRuleDto> {
    const existing = await this.prisma.ticketAutoOpenRule.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Regra não encontrada.');

    const data = this.normalizeDto(dto);
    const updated = await this.prisma.ticketAutoOpenRule.update({
      where: { id },
      data,
    });
    return this.map(updated);
  }

  async setActive(id: string, active: boolean): Promise<TicketAutoOpenRuleDto> {
    const existing = await this.prisma.ticketAutoOpenRule.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Regra não encontrada.');

    const updated = await this.prisma.ticketAutoOpenRule.update({
      where: { id },
      data: { active },
    });
    return this.map(updated);
  }

  async remove(id: string): Promise<{ ok: true }> {
    const existing = await this.prisma.ticketAutoOpenRule.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Regra não encontrada.');

    await this.prisma.ticketAutoOpenRule.update({
      where: { id },
      data: { deletedAt: new Date(), active: false },
    });
    return { ok: true };
  }

  private buildCreateTicketDto(rule: {
    deskExternalId: number;
    clientExternalId: number;
    responsibleExternalId: number | null;
    priorityExternalId: number | null;
    servicesCatalogsItemId: number | null;
    classificationId: string | null;
    title: string;
    description: string;
    requestorName: string;
    requestorEmail: string;
    requestorTelephone: string | null;
    requestorExternalId: number | null;
    externalGmudRef: string | null;
    ccEmails: string[];
  }): CreateTicketDto {
    return {
      title: rule.title,
      description: rule.description,
      clientId: rule.clientExternalId,
      deskId: rule.deskExternalId,
      priorityId: rule.priorityExternalId ?? undefined,
      servicesCatalogsItemId: rule.servicesCatalogsItemId ?? undefined,
      classificationId: rule.classificationId ?? undefined,
      responsibleId: rule.responsibleExternalId,
      requestorId: rule.requestorExternalId ?? undefined,
      requestorName: rule.requestorName,
      requestorEmail: rule.requestorEmail,
      requestorTelephone: rule.requestorTelephone ?? undefined,
      externalGmudRef: rule.externalGmudRef ?? undefined,
      ccEmails: rule.ccEmails.length ? rule.ccEmails : undefined,
    };
  }

  async processDueRules(
    limit = 20,
  ): Promise<{ processed: number; errors: number }> {
    const now = new Date();
    const candidates = await this.prisma.ticketAutoOpenRule.findMany({
      where: { active: true, deletedAt: null },
      orderBy: { nextScheduledDate: 'asc' },
      take: 100,
    });

    let processed = 0;
    let errors = 0;

    for (const rule of candidates) {
      if (processed >= limit) break;
      const dueAt = parseRuleDueAt({
        nextScheduledDate: rule.nextScheduledDate,
        scheduleTime: rule.scheduleTime,
      });
      if (dueAt.getTime() > now.getTime()) continue;

      try {
        const user = await this.prisma.user.findUnique({
          where: { id: rule.createdBy },
          select: { id: true, tokenVersion: true },
        });
        if (!user) {
          throw new BadRequestException(
            'Usuário criador da regra não encontrado.',
          );
        }

        const actor = await this.permissionsService.buildRequestUser(
          user.id,
          user.tokenVersion ?? 0,
        );

        const result = await this.ticketsService.createTicket(
          actor,
          this.buildCreateTicketDto(rule),
        );

        const nextDate = advanceScheduledDate(
          rule.nextScheduledDate,
          rule.periodicity,
        );

        await this.prisma.ticketAutoOpenRule.update({
          where: { id: rule.id },
          data: {
            lastRunAt: now,
            lastTicketNumber: result.ticketNumber,
            nextScheduledDate: nextDate,
          },
        });

        if (rule.parentTicketNumber && Number.isFinite(result.ticketNumber)) {
          try {
            await this.ticketsService.groupIntoParent(
              actor,
              result.ticketNumber,
              rule.parentTicketNumber,
            );
          } catch (err) {
            this.logger.warn(
              `Ticket ${result.ticketNumber} criado, mas agrupamento falhou: ${
                err instanceof Error ? err.message : err
              }`,
            );
          }
        }

        processed += 1;
        this.logger.log(
          `Regra "${rule.name}" abriu ticket #${result.ticketNumber}`,
        );
      } catch (err) {
        errors += 1;
        this.logger.error(
          `Falha na regra "${rule.name}": ${
            err instanceof Error ? err.message : err
          }`,
        );
      }
    }

    return { processed, errors };
  }
}
