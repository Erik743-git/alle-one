import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  ContractStatus,
  MailboxNotificationKind,
  Prisma,
  UserRole,
  UserStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedRequestUser } from '../auth/auth-request-user';
import { DashboardService } from '../dashboard/dashboard.service';
import { RendimentoService } from '../rendimento/rendimento.service';
import { InventarioService } from '../inventario/inventario.service';
import type { MailboxDraft } from './mailbox.types';
import {
  CONTRACT_USAGE_HIGH_PCT,
  CONTRACT_USAGE_LOW_PCT,
} from './mailbox.types';
import { isTicketsPortalCanonical } from '../tickets/tickets-portal.config';

type TifluxUserMap = Map<string, { id: number; userId: string }>;

@Injectable()
export class MailboxService {
  private readonly logger = new Logger(MailboxService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dashboard: DashboardService,
    private readonly rendimento: RendimentoService,
    private readonly inventario: InventarioService,
  ) {}

  async list(actor: AuthenticatedRequestUser) {
    await this.refreshForUser(actor);
    return this.prisma.mailboxNotification.findMany({
      where: { userId: actor.userId },
      orderBy: [{ readAt: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async unreadCount(actor: AuthenticatedRequestUser) {
    await this.refreshForUser(actor);
    return this.prisma.mailboxNotification.count({
      where: { userId: actor.userId, readAt: null },
    });
  }

  async markRead(actor: AuthenticatedRequestUser, id: string) {
    const row = await this.prisma.mailboxNotification.findFirst({
      where: { id, userId: actor.userId },
    });
    if (!row) throw new NotFoundException('Notificação não encontrada.');
    return this.prisma.mailboxNotification.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }

  async markAllRead(actor: AuthenticatedRequestUser) {
    await this.prisma.mailboxNotification.updateMany({
      where: { userId: actor.userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }

  async notifyTifluxSyncStale(
    userIds: string[],
    message: string,
    lastTicketUpdate: string | null,
  ): Promise<void> {
    const dedupeKey = 'integration:tiflux-sync-stale';
    const body = lastTicketUpdate
      ? `${message} Último ticket no espelho: ${lastTicketUpdate}.`
      : message;

    for (const userId of userIds) {
      await this.prisma.mailboxNotification.upsert({
        where: {
          userId_dedupeKey: { userId, dedupeKey },
        },
        create: {
          userId,
          kind: MailboxNotificationKind.TIFLUX_SYNC_STALE,
          title: 'Sync TiFlux atrasado',
          body,
          href: '/admin',
          dedupeKey,
          payload: { lastTicketUpdate } as Prisma.InputJsonValue,
        },
        update: {
          kind: MailboxNotificationKind.TIFLUX_SYNC_STALE,
          title: 'Sync TiFlux atrasado',
          body,
          href: '/admin',
          readAt: null,
          payload: { lastTicketUpdate } as Prisma.InputJsonValue,
        },
      });
    }
  }

  async clearTifluxSyncStaleAlerts(): Promise<void> {
    await this.prisma.mailboxNotification.deleteMany({
      where: { kind: MailboxNotificationKind.TIFLUX_SYNC_STALE },
    });
  }

  async refreshForUser(actor: AuthenticatedRequestUser): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: actor.userId, deletedAt: null, status: UserStatus.ACTIVE },
      select: { id: true, role: true, email: true, companyId: true },
    });
    if (!user) return;

    const drafts: MailboxDraft[] = [];
    const kindsToPrune: MailboxNotificationKind[] = [];

    if (user.role === UserRole.COLLABORATOR || user.role === UserRole.ADMIN) {
      kindsToPrune.push(MailboxNotificationKind.RENDIMENTO_ALERT);
      drafts.push(...(await this.buildRendimentoAlerts(actor, user.id)));
    }

    if (this.canApproveRendimento(actor)) {
      kindsToPrune.push(MailboxNotificationKind.RENDIMENTO_APPROVAL_PENDING);
      drafts.push(...(await this.buildRendimentoApprovalPending()));
    }

    kindsToPrune.push(MailboxNotificationKind.GMUD_PENDING_APPROVAL);
    drafts.push(...(await this.buildGmudPendingForUser(user.id)));

    if (this.isAdminActor(actor) || this.hasFinancialView(actor)) {
      kindsToPrune.push(MailboxNotificationKind.CONTRACT_USAGE);
      drafts.push(...(await this.buildContractUsageAlerts(actor)));
    }

    const tifluxMap = await this.loadTifluxUserPortalMap();
    const ticketKinds: MailboxNotificationKind[] = [
      MailboxNotificationKind.TICKET_NO_APPOINTMENT_24H,
    ];
    if (user.role === UserRole.ADMIN) {
      ticketKinds.push(
        MailboxNotificationKind.TICKET_STALLED_48H,
        MailboxNotificationKind.TICKET_STALLED_7D,
      );
    }
    kindsToPrune.push(...ticketKinds);
    drafts.push(...(await this.buildTicketAlerts(user, tifluxMap)));

    if (user.role === UserRole.ADMIN || user.role === UserRole.COLLABORATOR) {
      kindsToPrune.push(MailboxNotificationKind.INVENTORY_EXPIRY);
      drafts.push(...(await this.buildInventoryExpiryAlerts(user.id)));
    }

    await this.syncDrafts(user.id, drafts, kindsToPrune);
  }

  async refreshAllActiveUsers(): Promise<void> {
    const users = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        status: UserStatus.ACTIVE,
        role: { in: [UserRole.ADMIN, UserRole.COLLABORATOR, UserRole.PJ] },
      },
      select: { id: true, email: true, role: true, companyId: true },
    });

    for (const user of users) {
      try {
        const actor: AuthenticatedRequestUser = {
          userId: user.id,
          email: user.email,
          role: user.role,
          companyId: user.companyId,
          permissions: [],
        };
        await this.refreshForUser(actor);
      } catch (err) {
        this.logger.warn(
          `Falha ao atualizar correio do usuário ${user.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  /** Contratos: executar no dia 15 (e quando admin abre o correio). */
  async refreshContractAlertsForAdmins(reference = new Date()): Promise<void> {
    const admins = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        status: UserStatus.ACTIVE,
        role: UserRole.ADMIN,
      },
      select: { id: true, email: true, role: true, companyId: true },
    });

    for (const admin of admins) {
      const actor: AuthenticatedRequestUser = {
        userId: admin.id,
        email: admin.email,
        role: admin.role,
        companyId: admin.companyId,
        permissions: [],
      };
      const contracts = await this.buildContractUsageAlerts(actor);
      await this.syncDrafts(admin.id, contracts, [
        MailboxNotificationKind.CONTRACT_USAGE,
      ]);
    }

    this.logger.log(
      `Alertas de contrato (dia ${reference.getDate()}) processados para ${admins.length} administrador(es).`,
    );
  }

  private async syncDrafts(
    userId: string,
    drafts: MailboxDraft[],
    kindsToPrune: MailboxNotificationKind[],
  ) {
    const dedupeKeys = drafts.map((d) => d.dedupeKey);

    for (const draft of drafts) {
      await this.prisma.mailboxNotification.upsert({
        where: {
          userId_dedupeKey: { userId, dedupeKey: draft.dedupeKey },
        },
        create: {
          userId,
          kind: draft.kind,
          title: draft.title,
          body: draft.body,
          href: draft.href ?? null,
          payload: (draft.payload ?? undefined) as
            | Prisma.InputJsonValue
            | undefined,
          dedupeKey: draft.dedupeKey,
        },
        update: {
          kind: draft.kind,
          title: draft.title,
          body: draft.body,
          href: draft.href ?? null,
          payload: (draft.payload ?? undefined) as
            | Prisma.InputJsonValue
            | undefined,
        },
      });
    }

    if (kindsToPrune.length) {
      await this.prisma.mailboxNotification.deleteMany({
        where: {
          userId,
          kind: { in: kindsToPrune },
          ...(dedupeKeys.length ? { dedupeKey: { notIn: dedupeKeys } } : {}),
        },
      });
    }
  }

  private isAdminActor(actor: AuthenticatedRequestUser): boolean {
    return actor.role === UserRole.ADMIN;
  }

  private hasFinancialView(actor: AuthenticatedRequestUser): boolean {
    if (actor.role === UserRole.ADMIN) return true;
    return (
      actor.permissions?.some(
        (p) => p.module === 'FINANCIAL' && p.canView === true,
      ) ?? false
    );
  }

  private canApproveRendimento(actor: AuthenticatedRequestUser): boolean {
    if (actor.role === UserRole.ADMIN) return true;
    return (
      actor.permissions?.some(
        (p) => p.module === 'RENDIMENTO' && p.canApprove === true,
      ) ?? false
    );
  }

  private async buildRendimentoAlerts(
    actor: AuthenticatedRequestUser,
    userId: string,
  ): Promise<MailboxDraft[]> {
    try {
      const now = new Date();
      const timesheet = await this.rendimento.getTimesheet({
        actor,
        userId,
        view: 'month',
        date: this.toDateOnly(now),
      });

      const alertDays = timesheet.days.filter(
        (day) => day.insights?.hasIdleGapAlert,
      );
      if (!alertDays.length) return [];

      const monthLabel = now.toLocaleDateString('pt-BR', {
        month: 'long',
        year: 'numeric',
      });

      if (alertDays.length === 1) {
        const day = alertDays[0];
        const dateLabel = new Date(
          `${day.date.slice(0, 10)}T12:00:00`,
        ).toLocaleDateString('pt-BR');
        return [
          {
            kind: MailboxNotificationKind.RENDIMENTO_ALERT,
            title: 'Intervalo sem registro de horas',
            body: `Há um intervalo sem registro de horas em ${dateLabel} (${monthLabel}). Confira sua agenda.`,
            href: `/apontamentos/${userId}`,
            dedupeKey: `rendimento:alert:${day.date.slice(0, 10)}`,
            payload: { date: day.date.slice(0, 10), userId },
          },
        ];
      }

      return [
        {
          kind: MailboxNotificationKind.RENDIMENTO_ALERT,
          title: 'Intervalos na agenda',
          body: `Há ${alertDays.length} dia(s) com intervalo sem registro de horas em ${monthLabel}. Confira sua agenda.`,
          href: `/apontamentos/${userId}`,
          dedupeKey: `rendimento:alert:month:${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
          payload: {
            count: alertDays.length,
            month: monthLabel,
            userId,
          },
        },
      ];
    } catch (err) {
      this.logger.debug(
        `Rendimento não disponível para ${userId}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return [];
    }
  }

  private async buildRendimentoApprovalPending(): Promise<MailboxDraft[]> {
    const rows =
      (await this.prisma.$queryRaw<
        Array<{
          id: string;
          user_id: string;
          date_ref: string;
          user_name: string;
          from_time: string;
          to_time: string;
        }>
      >`
        SELECT j.id, j.user_id, j.date_ref::text AS date_ref, u.name AS user_name,
               to_char(j.from_time, 'HH24:MI') AS from_time,
               to_char(j.to_time, 'HH24:MI') AS to_time
        FROM rendimento_gap_justifications j
        INNER JOIN users u ON u.id = j.user_id
        WHERE j.status = 'PENDING' AND j.deleted_at IS NULL
        ORDER BY j.created_at DESC
        LIMIT 50
      `) ?? [];

    return rows.map((row) => ({
      kind: MailboxNotificationKind.RENDIMENTO_APPROVAL_PENDING,
      title: 'Justificativa aguardando análise',
      body: `${row.user_name} · ${row.date_ref.slice(0, 10)} (${row.from_time}–${row.to_time}) — justificativa aguardando análise.`,
      href: `/apontamentos/${row.user_id}`,
      dedupeKey: `rendimento:justification:${row.id}`,
      payload: { justificationId: row.id, userId: row.user_id },
    }));
  }

  private async buildGmudPendingForUser(
    userId: string,
  ): Promise<MailboxDraft[]> {
    const rows = await this.prisma.gmudApprover.findMany({
      where: {
        userId,
        status: 'PENDING',
        gmud: { status: 'PENDING_APPROVAL', deletedAt: null },
      },
      include: {
        gmud: {
          select: { id: true, code: true, title: true, companyId: true },
        },
      },
      orderBy: { gmud: { createdAt: 'desc' } },
      take: 30,
    });

    return rows.map((row) => ({
      kind: MailboxNotificationKind.GMUD_PENDING_APPROVAL,
      title: 'GMUD aguardando sua aprovação',
      body: `${row.gmud.code} — ${row.gmud.title}`,
      href: `/gmud/${row.gmud.id}`,
      dedupeKey: `gmud:approval:${row.gmud.id}`,
      payload: { gmudId: row.gmud.id, code: row.gmud.code },
    }));
  }

  private async buildContractUsageAlerts(
    actor: AuthenticatedRequestUser,
  ): Promise<MailboxDraft[]> {
    const companies = await this.prisma.company.findMany({
      where: { deletedAt: null, tifluxClientId: { not: null } },
      select: { id: true, name: true, tifluxClientId: true },
      orderBy: { name: 'asc' },
    });

    const now = new Date();
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
      999,
    );
    const monthLabel = startMonth.toLocaleDateString('pt-BR', {
      month: 'long',
      year: 'numeric',
    });

    const drafts: MailboxDraft[] = [];

    for (const company of companies) {
      const contractedHours = await this.getContractedHours(company.id);
      if (!contractedHours || contractedHours <= 0) continue;

      const hours = await this.dashboard.getDashboardHours(actor, {
        group: 'financeiro',
        companyId: company.id,
        start: startMonth.toISOString(),
        end: endMonth.toISOString(),
      });

      const used = Number(hours?.summary?.totalHoras ?? 0);
      const pct = Math.round((used / contractedHours) * 1000) / 10;

      if (pct >= CONTRACT_USAGE_LOW_PCT && pct <= CONTRACT_USAGE_HIGH_PCT) {
        continue;
      }

      const below = pct < CONTRACT_USAGE_LOW_PCT;
      drafts.push({
        kind: MailboxNotificationKind.CONTRACT_USAGE,
        title: below
          ? 'Contrato — consumo abaixo do esperado'
          : 'Contrato — consumo acima do esperado',
        body: `${company.name}: ${pct}% das horas contratadas em ${monthLabel} (${used}h de ${contractedHours}h). Faixa sem alerta: ${CONTRACT_USAGE_LOW_PCT}%–${CONTRACT_USAGE_HIGH_PCT}%.`,
        href: `/financeiro?companyId=${company.id}`,
        dedupeKey: `contract:usage:${company.id}:${now.getFullYear()}-${now.getMonth() + 1}`,
        payload: {
          companyId: company.id,
          pct,
          used,
          contractedHours,
          monthLabel,
        },
      });
    }

    return drafts;
  }

  private async getContractedHours(companyId: string): Promise<number> {
    const contracts = await this.prisma.contract.findMany({
      where: { companyId, deletedAt: null, status: ContractStatus.ACTIVE },
      select: { monthlyHours: true },
    });
    return contracts.reduce((acc, c) => acc + (c.monthlyHours ?? 0), 0);
  }

  private async buildTicketAlerts(
    user: { id: string; role: UserRole; email: string },
    tifluxMap: TifluxUserMap,
  ): Promise<MailboxDraft[]> {
    const drafts: MailboxDraft[] = [];
    const isAdmin = user.role === UserRole.ADMIN;
    const ticketsTable = isTicketsPortalCanonical()
      ? 'portal_tickets'
      : 'tiflux.tickets';
    const appointmentsTable = isTicketsPortalCanonical()
      ? 'portal_ticket_appointments'
      : 'tiflux.ticket_appointments';

    const noApptRows =
      (await this.prisma.$queryRawUnsafe<
        Array<{
          ticket_number: number;
          title: string | null;
          responsible_external_id: number | null;
          created_at_source: Date | null;
        }>
      >(
        `
        SELECT t.ticket_number, t.title, t.responsible_external_id, t.created_at_source
        FROM ${ticketsTable} t
        WHERE COALESCE(t.is_closed, false) = false
          AND t.responsible_external_id IS NOT NULL
          AND t.created_at_source IS NOT NULL
          AND t.created_at_source < NOW() - INTERVAL '24 hours'
          AND NOT EXISTS (
            SELECT 1 FROM ${appointmentsTable} a
            WHERE a.ticket_number = t.ticket_number
          )
        ORDER BY t.created_at_source ASC
        LIMIT 100
      `,
      )) ?? [];

    for (const row of noApptRows) {
      const portalUserId = this.portalUserIdForTiflux(
        row.responsible_external_id,
        tifluxMap,
      );
      if (portalUserId !== user.id) continue;

      drafts.push({
        kind: MailboxNotificationKind.TICKET_NO_APPOINTMENT_24H,
        title: 'Chamado sem registro de horas (24h+)',
        body: `Chamado #${row.ticket_number}${row.title ? ` — ${row.title}` : ''}: aberto há mais de 24h sem registro de horas.`,
        href: '/dashboard',
        dedupeKey: `ticket:no-appt:24h:${row.ticket_number}`,
        payload: { ticketNumber: row.ticket_number },
      });
    }

    if (isAdmin) {
      const stalled48 =
        (await this.prisma.$queryRawUnsafe<
          Array<{
            ticket_number: number;
            title: string | null;
            updated_at_source: Date | null;
          }>
        >(
          `
          SELECT t.ticket_number, t.title, t.updated_at_source
          FROM ${ticketsTable} t
          WHERE COALESCE(t.is_closed, false) = false
            AND t.updated_at_source IS NOT NULL
            AND t.updated_at_source < NOW() - INTERVAL '48 hours'
            AND t.updated_at_source >= NOW() - INTERVAL '7 days'
          ORDER BY t.updated_at_source ASC
          LIMIT 80
        `,
        )) ?? [];

      for (const row of stalled48) {
        drafts.push({
          kind: MailboxNotificationKind.TICKET_STALLED_48H,
          title: 'Chamado parado (48h+)',
          body: `Chamado #${row.ticket_number}${row.title ? ` — ${row.title}` : ''}: sem atualização há mais de 48 horas.`,
          href: '/dashboard',
          dedupeKey: `ticket:stalled:48h:${row.ticket_number}`,
          payload: { ticketNumber: row.ticket_number },
        });
      }

      const stalled7d =
        (await this.prisma.$queryRawUnsafe<
          Array<{
            ticket_number: number;
            title: string | null;
            updated_at_source: Date | null;
          }>
        >(
          `
          SELECT t.ticket_number, t.title, t.updated_at_source
          FROM ${ticketsTable} t
          WHERE COALESCE(t.is_closed, false) = false
            AND t.updated_at_source IS NOT NULL
            AND t.updated_at_source < NOW() - INTERVAL '7 days'
          ORDER BY t.updated_at_source ASC
          LIMIT 80
        `,
        )) ?? [];

      for (const row of stalled7d) {
        drafts.push({
          kind: MailboxNotificationKind.TICKET_STALLED_7D,
          title: 'Chamado parado (7 dias+)',
          body: `Chamado #${row.ticket_number}${row.title ? ` — ${row.title}` : ''}: sem atualização há mais de 7 dias.`,
          href: '/dashboard',
          dedupeKey: `ticket:stalled:7d:${row.ticket_number}`,
          payload: { ticketNumber: row.ticket_number },
        });
      }
    }

    return drafts;
  }

  private async buildInventoryExpiryAlerts(
    userId: string,
  ): Promise<MailboxDraft[]> {
    const alerts = await this.inventario.listExpiryAlertsForUser(userId);
    return alerts.map((item) => ({
      kind: MailboxNotificationKind.INVENTORY_EXPIRY,
      title: item.title,
      body: item.body,
      href: item.href,
      dedupeKey: item.dedupeKey,
      payload: {
        assetId: item.assetId,
        companyId: item.companyId,
        overdue: item.overdue,
      },
    }));
  }

  private async loadTifluxUserPortalMap(): Promise<TifluxUserMap> {
    const map: TifluxUserMap = new Map();
    const users = await this.prisma.user.findMany({
      where: { deletedAt: null, status: UserStatus.ACTIVE },
      select: { id: true, email: true, name: true },
    });
    const portalByEmail = new Map(
      users.map((u) => [u.email.trim().toLowerCase(), u.id]),
    );
    const portalByName = new Map(
      users.map((u) => [u.name.trim().toLowerCase(), u.id]),
    );

    if (isTicketsPortalCanonical()) {
      const tickets = await this.prisma.portalTicket.findMany({
        where: {
          responsibleExternalId: { not: null },
          responsibleName: { not: null },
        },
        select: { responsibleExternalId: true, responsibleName: true },
        take: 5000,
      });
      for (const t of tickets) {
        const extId = t.responsibleExternalId;
        const name = t.responsibleName?.trim().toLowerCase();
        if (extId == null || !name) continue;
        const key = String(extId);
        if (map.has(key)) continue;
        const portalId = portalByName.get(name);
        if (!portalId) continue;
        map.set(key, { id: extId, userId: portalId });
      }
      if (map.size > 0) return map;
    }

    try {
      const rows =
        (await this.prisma.$queryRaw<
          Array<{ external_id: number; email: string }>
        >`
          SELECT tu.external_id, lower(trim(tu.email)) AS email
          FROM tiflux.users tu
          WHERE tu.email IS NOT NULL AND trim(tu.email) <> ''
        `) ?? [];

      for (const row of rows) {
        const portalId = portalByEmail.get(row.email);
        if (!portalId) continue;
        map.set(String(row.external_id), {
          id: Number(row.external_id),
          userId: portalId,
        });
      }
    } catch {
      this.logger.warn(
        'Mailbox: mapa tiflux.users indisponível — alertas de responsável podem ficar incompletos.',
      );
    }
    return map;
  }

  private portalUserIdForTiflux(
    tifluxUserId: number | null,
    map: TifluxUserMap,
  ): string | null {
    if (tifluxUserId == null) return null;
    return map.get(String(tifluxUserId))?.userId ?? null;
  }

  private toDateOnly(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}
