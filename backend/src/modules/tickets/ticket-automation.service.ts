import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { Prisma, TicketAutomationTrigger } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedRequestUser } from '../auth/auth-request-user';
import { MailService } from '../mail/mail.service';
import { PermissionsService } from '../permissions/permissions.service';
import {
  CreateTicketAutomationRuleDto,
  UpdateTicketAutomationRuleDto,
} from './ticket-automation.dto';
import {
  hasAnyAutomationCondition,
  matchesAutomationConditions,
  normalizeAutomationActions,
  normalizeAutomationConditions,
  renderAutomationTemplate,
} from './ticket-automation.helper';
import type {
  TicketAutomationAction,
  TicketAutomationConditions,
  TicketAutomationRuleDto,
  TicketAutomationSetFieldName,
  TicketAutomationTicketContext,
  TicketStageChangeContext,
} from './ticket-automation.types';
import { TicketsCatalogsService } from './tickets-catalogs.service';
import { TicketsAppointmentsService } from './tickets-appointments.service';
import { TicketsQueryService } from './tickets-query.service';
import { TicketsService } from './tickets.service';
import { canonicalizeStageName } from './tickets-stage-groups';

@Injectable()
export class TicketAutomationService {
  private readonly logger = new Logger(TicketAutomationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => TicketsService))
    private readonly ticketsService: TicketsService,
    private readonly appointments: TicketsAppointmentsService,
    private readonly catalogs: TicketsCatalogsService,
    private readonly mail: MailService,
    private readonly permissionsService: PermissionsService,
    @Inject(forwardRef(() => TicketsQueryService))
    private readonly ticketsQuery: TicketsQueryService,
  ) {}

  private map(row: {
    id: string;
    name: string;
    description: string | null;
    active: boolean;
    trigger: TicketAutomationTrigger;
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

    const trigger = dto.trigger ?? 'STAGE_CHANGE';
    const conditions = normalizeAutomationConditions(dto.conditions);
    if (!hasAnyAutomationCondition(trigger, conditions)) {
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
        trigger,
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

    const trigger = dto.trigger ?? existing.trigger;
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

    if (
      dto.conditions != null &&
      !hasAnyAutomationCondition(trigger, conditions)
    ) {
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
    await this.dispatchTrigger(actor, 'STAGE_CHANGE', {
      ...ctx,
      stageName: ctx.toStageName,
    }, {
      fromStageName: ctx.fromStageName,
      toStageName: ctx.toStageName,
    });
  }

  async handleTicketOpened(
    actor: AuthenticatedRequestUser,
    ticketNumber: number,
  ) {
    const ctx = await this.loadTicketContext(ticketNumber);
    if (!ctx) return;
    await this.dispatchTrigger(actor, 'TICKET_OPENED', ctx);
  }

  async handleNewReply(
    actor: AuthenticatedRequestUser,
    ticketNumber: number,
  ) {
    const ctx = await this.loadTicketContext(ticketNumber);
    if (!ctx) return;
    await this.dispatchTrigger(actor, 'TICKET_NEW_REPLY', ctx);
  }

  async dispatchNewReplyForUser(userId: string, ticketNumber: number) {
    const actor = await this.buildActorFromUserId(userId);
    if (!actor) return;
    await this.handleNewReply(actor, ticketNumber);
  }

  async processIdleRules(limit = 50): Promise<{
    processed: number;
    errors: number;
  }> {
    const rules = await this.prisma.ticketAutomationRule.findMany({
      where: { active: true, deletedAt: null, trigger: 'TICKET_IDLE' },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    if (!rules.length) return { processed: 0, errors: 0 };

    let processed = 0;
    let errors = 0;

    for (const rule of rules) {
      const conditions = normalizeAutomationConditions(
        rule.conditions as TicketAutomationConditions,
      );
      const idleMinutes = conditions.idleMinutes;
      if (!idleMinutes || idleMinutes <= 0) continue;

      const actor = await this.buildActorFromUserId(rule.createdBy);
      if (!actor) {
        errors += 1;
        continue;
      }

      const candidates = await this.prisma.portalTicket.findMany({
        where: {
          isClosed: false,
          isPreTicket: false,
          ...(conditions.deskExternalId != null
            ? { deskExternalId: conditions.deskExternalId }
            : {}),
          ...(conditions.clientExternalId != null
            ? { clientExternalId: conditions.clientExternalId }
            : {}),
          ...(conditions.classificationId
            ? { classificationId: conditions.classificationId }
            : {}),
          ...(conditions.idleStageName
            ? { stageName: conditions.idleStageName }
            : {}),
        },
        select: {
          ticketNumber: true,
          stageName: true,
          deskExternalId: true,
          clientExternalId: true,
          classificationId: true,
          createdAtSource: true,
          createdAt: true,
        },
        take: limit,
        orderBy: { updatedAtSource: 'asc' },
      });

      for (const ticket of candidates) {
        const ctx: TicketAutomationTicketContext = {
          ticketNumber: ticket.ticketNumber,
          deskExternalId: ticket.deskExternalId,
          clientExternalId: ticket.clientExternalId,
          classificationId: ticket.classificationId,
          stageName: ticket.stageName,
        };
        if (!matchesAutomationConditions('TICKET_IDLE', conditions, ctx)) {
          continue;
        }

        const stageEnteredAt = await this.resolveStageEnteredAt(
          ticket.ticketNumber,
          ticket.stageName,
          ticket.createdAtSource ?? ticket.createdAt,
        );
        const idleMs = idleMinutes * 60_000;
        if (Date.now() - stageEnteredAt.getTime() < idleMs) {
          continue;
        }

        const priorRun = await this.prisma.ticketAutomationRun.findFirst({
          where: {
            ruleId: rule.id,
            ticketNumber: ticket.ticketNumber,
            status: 'SUCCESS',
            createdAt: { gte: stageEnteredAt },
          },
          orderBy: { createdAt: 'desc' },
        });
        if (priorRun) continue;

        const actions = normalizeAutomationActions(
          rule.actions as TicketAutomationAction[],
        );
        try {
          await this.executeActions(actor, ticket.ticketNumber, actions);
          await this.prisma.ticketAutomationRun.create({
            data: {
              ruleId: rule.id,
              ticketNumber: ticket.ticketNumber,
              status: 'SUCCESS',
              detail: {
                trigger: 'TICKET_IDLE',
                idleMinutes,
                stageName: ticket.stageName,
                stageEnteredAt: stageEnteredAt.toISOString(),
                actions,
              },
            },
          });
          processed += 1;
        } catch (error) {
          errors += 1;
          const message =
            error instanceof Error
              ? error.message
              : 'Falha ao executar automação.';
          this.logger.warn(
            `Automação idle ${rule.id} falhou no ticket #${ticket.ticketNumber}: ${message}`,
          );
          await this.prisma.ticketAutomationRun.create({
            data: {
              ruleId: rule.id,
              ticketNumber: ticket.ticketNumber,
              status: 'FAILED',
              detail: { message, actions },
            },
          });
        }
      }
    }

    return { processed, errors };
  }

  private async dispatchTrigger(
    actor: AuthenticatedRequestUser,
    trigger: TicketAutomationTrigger,
    ctx: TicketAutomationTicketContext,
    detailExtra?: Record<string, unknown>,
  ) {
    const rules = await this.prisma.ticketAutomationRule.findMany({
      where: { active: true, deletedAt: null, trigger },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    for (const rule of rules) {
      const conditions = normalizeAutomationConditions(
        rule.conditions as TicketAutomationConditions,
      );
      if (!matchesAutomationConditions(trigger, conditions, ctx)) {
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
            detail: { trigger, ...detailExtra, actions },
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
            detail: { trigger, message, actions },
          },
        });
      }
    }
  }

  private async loadTicketContext(
    ticketNumber: number,
  ): Promise<TicketAutomationTicketContext | null> {
    const portal = await this.prisma.portalTicket.findUnique({
      where: { ticketNumber },
      select: {
        ticketNumber: true,
        deskExternalId: true,
        clientExternalId: true,
        classificationId: true,
        stageName: true,
      },
    });
    if (!portal) return null;
    return {
      ticketNumber: portal.ticketNumber,
      deskExternalId: portal.deskExternalId,
      clientExternalId: portal.clientExternalId,
      classificationId: portal.classificationId,
      stageName: portal.stageName,
    };
  }

  private async buildActorFromUserId(
    userId: string,
  ): Promise<AuthenticatedRequestUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, tokenVersion: true },
    });
    if (!user) return null;
    return this.permissionsService.buildRequestUser(
      user.id,
      user.tokenVersion ?? 0,
    );
  }

  private async resolveStageEnteredAt(
    ticketNumber: number,
    currentStage: string | null,
    fallback: Date,
  ): Promise<Date> {
    const normalizedCurrent =
      canonicalizeStageName(currentStage?.trim() ?? '') ??
      currentStage?.trim() ??
      '';

    const events = await this.prisma.ticketHistory.findMany({
      where: { ticketNumber, eventType: 'STAGE_CHANGED' },
      orderBy: { occurredAt: 'desc' },
      take: 30,
      select: { occurredAt: true, payload: true },
    });

    for (const event of events) {
      const payload = event.payload as { toStageName?: string } | null;
      const toStage =
        canonicalizeStageName(payload?.toStageName?.trim() ?? '') ??
        payload?.toStageName?.trim() ??
        '';
      if (toStage && toStage === normalizedCurrent) {
        return event.occurredAt;
      }
    }

    return fallback;
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
        case 'SET_FIELD':
          await this.applySetField(
            actor,
            ticketNumber,
            action.field,
            action.value,
          );
          break;
        case 'SEND_EMAIL':
          await this.applySendEmail(actor, ticketNumber, action);
          break;
        case 'TRIGGER_WEBHOOK':
          await this.applyTriggerWebhook(ticketNumber, action);
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

  private async applySetField(
    actor: AuthenticatedRequestUser,
    ticketNumber: number,
    field: TicketAutomationSetFieldName,
    value: string | number | boolean,
  ) {
    if (field === 'stageName' && typeof value === 'string') {
      await this.applySetStage(actor, ticketNumber, value);
      return;
    }

    const dto: Record<string, unknown> = {};
    switch (field) {
      case 'title':
        if (typeof value === 'string') dto.title = value;
        break;
      case 'statusName':
        if (typeof value === 'string') dto.statusName = value;
        break;
      case 'isClosed':
        if (typeof value === 'boolean') dto.isClosed = value;
        break;
      case 'clientId':
        if (typeof value === 'number') dto.clientId = value;
        break;
      case 'deskId':
        if (typeof value === 'number') dto.deskId = value;
        break;
      case 'responsibleId':
        if (typeof value === 'number') dto.responsibleId = value;
        break;
      default:
        break;
    }

    if (!Object.keys(dto).length) {
      throw new BadRequestException(`Valor inválido para o campo "${field}".`);
    }

    await this.ticketsService.updateTicket(actor, ticketNumber, dto);
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

  private async applySendEmail(
    _actor: AuthenticatedRequestUser,
    ticketNumber: number,
    action: Extract<TicketAutomationAction, { type: 'SEND_EMAIL' }>,
  ) {
    const ticket = await this.prisma.portalTicket.findUnique({
      where: { ticketNumber },
      select: {
        title: true,
        clientName: true,
        stageName: true,
        requestorName: true,
        requestorEmail: true,
        responsibleName: true,
        responsibleExternalId: true,
      },
    });
    if (!ticket) {
      throw new BadRequestException('Ticket não encontrado para envio de e-mail.');
    }

    const vars = {
      ticketNumber,
      title: ticket.title ?? '',
      clientName: ticket.clientName ?? '',
      stageName: ticket.stageName ?? '',
      requestorName: ticket.requestorName ?? '',
      requestorEmail: ticket.requestorEmail ?? '',
      responsibleName: ticket.responsibleName ?? '',
    };

    const subject = renderAutomationTemplate(action.subject, vars);
    const bodyText = renderAutomationTemplate(action.body, vars);
    const bodyHtml = bodyText.replace(/\n/g, '<br/>');

    let to: string[] = [];
    let cc: string[] | undefined;

    if (action.recipient === 'REQUESTOR') {
      if (ticket.requestorEmail?.trim()) {
        to = [ticket.requestorEmail.trim()];
      }
    } else if (action.recipient === 'RESPONSIBLE') {
      if (ticket.responsibleExternalId != null) {
        const responsibles = await this.catalogs.listResponsiblesForCatalogs();
        const match = responsibles.find(
          (r) => r.id === ticket.responsibleExternalId,
        );
        if (match?.email?.trim()) to = [match.email.trim()];
      }
    } else if (action.recipient === 'WATCHERS') {
      const watchers = await this.prisma.portalTicketWatcher.findMany({
        where: { ticketNumber },
        select: { email: true },
      });
      to = watchers.map((w) => w.email.trim()).filter(Boolean);
    } else if (action.recipient === 'CUSTOM') {
      const raw = action.customTo?.trim() ?? '';
      to = raw
        .split(/[,;]+/)
        .map((email) => email.trim())
        .filter(Boolean);
    }

    if (!to.length) {
      throw new BadRequestException(
        'Nenhum destinatário encontrado para o e-mail da automação.',
      );
    }

    const sent = await this.mail.sendMail({
      to,
      cc,
      subject,
      text: bodyText,
      html: bodyHtml,
    });
    if (!sent) {
      throw new BadRequestException(
        'Serviço de e-mail indisponível ou falhou ao enviar.',
      );
    }
  }

  private async applyTriggerWebhook(
    ticketNumber: number,
    action: Extract<TicketAutomationAction, { type: 'TRIGGER_WEBHOOK' }>,
  ) {
    const ticket = await this.prisma.portalTicket.findUnique({
      where: { ticketNumber },
    });
    if (!ticket) {
      throw new BadRequestException('Ticket não encontrado para webhook.');
    }

    const payload = {
      event: 'ticket_automation',
      ticketNumber,
      ticket: {
        title: ticket.title,
        clientName: ticket.clientName,
        clientExternalId: ticket.clientExternalId,
        deskExternalId: ticket.deskExternalId,
        deskName: ticket.deskName,
        stageName: ticket.stageName,
        statusName: ticket.statusName,
        isClosed: ticket.isClosed,
        requestorName: ticket.requestorName,
        requestorEmail: ticket.requestorEmail,
        responsibleExternalId: ticket.responsibleExternalId,
        responsibleName: ticket.responsibleName,
        classificationId: ticket.classificationId,
      },
      triggeredAt: new Date().toISOString(),
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'AlleOne-TicketAutomation/1.0',
    };
    if (action.secret?.trim()) {
      headers['X-Webhook-Secret'] = action.secret.trim();
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(action.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new BadRequestException(
          `Webhook retornou HTTP ${response.status}.`,
        );
      }
    } finally {
      clearTimeout(timeout);
    }
  }
}
