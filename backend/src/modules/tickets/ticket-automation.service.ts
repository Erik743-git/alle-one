import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedRequestUser } from '../auth/auth-request-user';
import {
  CreateTicketAutomationRuleDto,
  UpdateTicketAutomationRuleDto,
} from './ticket-automation.dto';
import {
  hasAnyAutomationCondition,
  matchesAutomationConditions,
  normalizeAutomationActions,
  normalizeAutomationConditions,
} from './ticket-automation.helper';
import type {
  TicketAutomationAction,
  TicketAutomationConditions,
  TicketAutomationRuleDto,
  TicketStageChangeContext,
} from './ticket-automation.types';
import { TicketsAppointmentsService } from './tickets-appointments.service';
import { TicketsQueryService } from './tickets-query.service';
import { TicketsService } from './tickets.service';

@Injectable()
export class TicketAutomationService {
  private readonly logger = new Logger(TicketAutomationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ticketsService: TicketsService,
    private readonly appointments: TicketsAppointmentsService,
    @Inject(forwardRef(() => TicketsQueryService))
    private readonly ticketsQuery: TicketsQueryService,
  ) {}

  private map(row: {
    id: string;
    name: string;
    description: string | null;
    active: boolean;
    trigger: 'STAGE_CHANGE';
    conditions: unknown;
    actions: unknown;
    sortOrder: number;
    createdAt: Date;
  }): TicketAutomationRuleDto {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      active: row.active,
      trigger: row.trigger,
      conditions: normalizeAutomationConditions(
        (row.conditions ?? {}) as TicketAutomationConditions,
      ),
      actions: normalizeAutomationActions(
        (row.actions ?? []) as TicketAutomationAction[],
      ),
      sortOrder: row.sortOrder,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async list(): Promise<TicketAutomationRuleDto[]> {
    const rows = await this.prisma.ticketAutomationRule.findMany({
      where: { deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return rows.map((row) => this.map(row));
  }

  async create(
    actor: AuthenticatedRequestUser,
    dto: CreateTicketAutomationRuleDto,
  ) {
    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException('Informe o nome da automação.');
    }

    const conditions = normalizeAutomationConditions(dto.conditions);
    if (!hasAnyAutomationCondition(conditions)) {
      throw new BadRequestException('Informe ao menos uma condição.');
    }

    const actions = normalizeAutomationActions(
      dto.actions as TicketAutomationAction[],
    );
    if (!actions.length) {
      throw new BadRequestException('Informe ao menos uma ação.');
    }

    const row = await this.prisma.ticketAutomationRule.create({
      data: {
        name,
        description: dto.description?.trim() || null,
        active: dto.active ?? true,
        trigger: dto.trigger ?? 'STAGE_CHANGE',
        conditions: conditions as unknown as Prisma.InputJsonValue,
        actions: actions as unknown as Prisma.InputJsonValue,
        sortOrder: dto.sortOrder ?? 0,
        createdBy: actor.userId,
      },
    });

    return this.map(row);
  }

  async update(id: string, dto: UpdateTicketAutomationRuleDto) {
    const existing = await this.prisma.ticketAutomationRule.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException('Automação não encontrada.');
    }

    const conditions =
      dto.conditions != null
        ? normalizeAutomationConditions(dto.conditions)
        : normalizeAutomationConditions(
            existing.conditions as TicketAutomationConditions,
          );
    const actions =
      dto.actions != null
        ? normalizeAutomationActions(dto.actions as TicketAutomationAction[])
        : normalizeAutomationActions(
            existing.actions as TicketAutomationAction[],
          );

    if (dto.conditions != null && !hasAnyAutomationCondition(conditions)) {
      throw new BadRequestException('Informe ao menos uma condição.');
    }
    if (dto.actions != null && !actions.length) {
      throw new BadRequestException('Informe ao menos uma ação.');
    }

    const row = await this.prisma.ticketAutomationRule.update({
      where: { id },
      data: {
        ...(dto.name != null ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description?.trim() || null }
          : {}),
        ...(dto.active != null ? { active: dto.active } : {}),
        ...(dto.trigger != null ? { trigger: dto.trigger } : {}),
        ...(dto.conditions != null
          ? { conditions: conditions as unknown as Prisma.InputJsonValue }
          : {}),
        ...(dto.actions != null
          ? { actions: actions as unknown as Prisma.InputJsonValue }
          : {}),
        ...(dto.sortOrder != null ? { sortOrder: dto.sortOrder } : {}),
      },
    });

    return this.map(row);
  }

  async setActive(id: string, active: boolean) {
    const existing = await this.prisma.ticketAutomationRule.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException('Automação não encontrada.');
    }
    const row = await this.prisma.ticketAutomationRule.update({
      where: { id },
      data: { active },
    });
    return this.map(row);
  }

  async remove(id: string) {
    const existing = await this.prisma.ticketAutomationRule.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) {
      throw new NotFoundException('Automação não encontrada.');
    }
    await this.prisma.ticketAutomationRule.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { ok: true };
  }

  async handleStageChange(
    actor: AuthenticatedRequestUser,
    ctx: TicketStageChangeContext,
  ) {
    const rules = await this.prisma.ticketAutomationRule.findMany({
      where: { active: true, deletedAt: null, trigger: 'STAGE_CHANGE' },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    for (const rule of rules) {
      const conditions = normalizeAutomationConditions(
        rule.conditions as TicketAutomationConditions,
      );
      if (!matchesAutomationConditions(conditions, ctx)) {
        continue;
      }

      const actions = normalizeAutomationActions(
        rule.actions as TicketAutomationAction[],
      );
      try {
        await this.executeActions(actor, ctx.ticketNumber, actions);
        await this.prisma.ticketAutomationRun.create({
          data: {
            ruleId: rule.id,
            ticketNumber: ctx.ticketNumber,
            status: 'SUCCESS',
            detail: {
              fromStageName: ctx.fromStageName,
              toStageName: ctx.toStageName,
              actions,
            },
          },
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Falha ao executar automação.';
        this.logger.warn(
          `Automação ${rule.id} falhou no ticket #${ctx.ticketNumber}: ${message}`,
        );
        await this.prisma.ticketAutomationRun.create({
          data: {
            ruleId: rule.id,
            ticketNumber: ctx.ticketNumber,
            status: 'FAILED',
            detail: { message, actions },
          },
        });
      }
    }
  }

  private async executeActions(
    actor: AuthenticatedRequestUser,
    ticketNumber: number,
    actions: TicketAutomationAction[],
  ) {
    for (const action of actions) {
      switch (action.type) {
        case 'SET_STAGE':
          await this.applySetStage(actor, ticketNumber, action.stageName);
          break;
        case 'SET_RESPONSIBLE':
          await this.ticketsService.updateTicket(actor, ticketNumber, {
            responsibleId: action.responsibleExternalId,
          });
          break;
        case 'ADD_APPOINTMENT':
          await this.applyAddAppointment(
            actor,
            ticketNumber,
            action.description,
            action.notifyClient,
          );
          break;
        default:
          break;
      }
    }
  }

  private async applySetStage(
    actor: AuthenticatedRequestUser,
    ticketNumber: number,
    stageName: string,
  ) {
    const stagesResponse = await this.ticketsQuery.listTicketStages(
      actor,
      ticketNumber,
    );
    const target = stagesResponse.stages.find(
      (stage) =>
        stage.name.trim().toLocaleLowerCase('pt-BR') ===
        stageName.trim().toLocaleLowerCase('pt-BR'),
    );
    if (!target) {
      throw new BadRequestException(
        `Estágio "${stageName}" não está disponível para este ticket.`,
      );
    }
    await this.ticketsQuery.updateTicketStage(actor, ticketNumber, target.id, {
      skipAutomations: true,
    });
  }

  private async applyAddAppointment(
    actor: AuthenticatedRequestUser,
    ticketNumber: number,
    description: string,
    notifyClient?: boolean,
  ) {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    await this.appointments.createAppointment(actor, ticketNumber, {
      date: `${y}-${m}-${d}`,
      initTime: '09:00',
      endTime: '09:30',
      description,
      serviceName: 'Automação',
      attendance: 'Internal',
      notifyClient: Boolean(notifyClient),
    });
  }
}
