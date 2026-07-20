import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { FileStorageService } from '../../common/storage/file-storage.service';
import {
  assertAllowedUploadMime,
  TICKET_APPOINTMENT_UPLOAD_MAX_BYTES,
} from '../../common/upload.config';
import {
  PortalTicketAppointmentSyncStatus,
  PortalTifluxOutboxKind,
  PortalTifluxOutboxStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedRequestUser } from '../auth/auth-request-user';
import { AuditService } from '../audit/audit.service';
import { TifluxService } from '../tiflux/tiflux.service';
import type {
  CreateTicketAppointmentDto,
  CreateTicketDto,
} from './tickets-create.dto';
import type { TicketsListQueryDto } from './tickets.dto';
import {
  resolveTicketStageGroup,
  TICKET_STAGE_GROUPS,
  type TicketStageGroupKey,
} from './tickets-stage-groups';
import {
  appointmentDescriptionToPlainText,
  enrichAppointmentDescriptionWithImages,
  type SavedAppointmentImage,
} from './appointment-doc.util';
import { isTifluxAppointmentSyncEnabled } from './tiflux-appointment-sync.config';
import { isAlleOneTifluxDesk, normalizeDeskName } from './tiflux-portal-desk.config';
import { ProjetosService } from '../projetos/projetos.service';

type TicketRow = {
  ticket_number: number;
  title: string | null;
  client_name: string | null;
  client_external_id: number | null;
  created_by_way_of: string | null;
  priority_name: string | null;
  status_name: string | null;
  stage_name: string | null;
  responsible_external_id: number | null;
  responsible_name: string | null;
  desk_name: string | null;
  desk_external_id: number | null;
  created_at_source: Date | null;
  updated_at_source: Date | null;
  is_closed: boolean | null;
  external_gmud_ref?: string | null;
};

type AppointmentRow = {
  external_id: number;
  ticket_number: number;
  appointment_date: Date | null;
  init_time: Date | null;
  end_time: Date | null;
  user_external_id: number | null;
  user_name: string | null;
  description: string | null;
  valorization_raw: unknown;
};

export type TicketListItemDto = {
  ticketNumber: number;
  title: string | null;
  clientName: string | null;
  origin: string | null;
  priorityName: string | null;
  statusName: string | null;
  stageName: string | null;
  responsibleName: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  stageGroup: TicketStageGroupKey;
  externalGmudRef: string | null;
};

export type TicketHistoryDto = {
  id: string;
  eventType: string;
  summary: string;
  actorName: string | null;
  createdAt: string;
};

export type TicketAppointmentDto = {
  externalId: number | null;
  portalAppointmentId: string | null;
  appointmentDate: string | null;
  initTime: string | null;
  endTime: string | null;
  minutes: number;
  userName: string | null;
  description: string | null;
  valorizationLabel: string | null;
  attendance: string | null;
  attendanceLabel: string | null;
  syncStatus: 'SYNCED' | 'PENDING_TIFLUX' | 'PORTAL_ONLY';
  syncPaused?: boolean;
  attachmentCount: number;
  attachments: Array<{
    id: string;
    fileId: string;
    originalName: string;
    mimeType: string;
    size: number;
    previewDataUrl: string | null;
  }>;
};

const ATTENDANCE_LABELS: Record<string, string> = {
  Remote: 'Remoto',
  External: 'Externo',
  Internal: 'Interno',
};

@Injectable()
export class TicketsService {
  private readonly logger = new Logger(TicketsService.name);
  private readonly allowRuntimeTifluxApi =
    process.env.TIFLUX_RUNTIME_API === 'true';

  constructor(
    private readonly prisma: PrismaService,
    private readonly tiflux: TifluxService,
    private readonly fileStorage: FileStorageService,
    private readonly projetos: ProjetosService,
    private readonly audit: AuditService,
  ) {}

  private formatTime(value: Date | null): string | null {
    if (!value) return null;
    const h = value.getUTCHours();
    const m = value.getUTCMinutes();
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  private formatDateOnly(value: Date | null): string | null {
    if (!value) return null;
    const y = value.getUTCFullYear();
    const mo = String(value.getUTCMonth() + 1).padStart(2, '0');
    const d = String(value.getUTCDate()).padStart(2, '0');
    return `${y}-${mo}-${d}`;
  }

  private toIso(value: Date | null): string | null {
    if (!value) return null;
    return value.toISOString();
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private async listTifluxResponsiblesForTicketCreate(): Promise<
    Array<{ id: number; name: string; email: string | null }>
  > {
    const [attendants, admins] = await Promise.all([
      this.tiflux.getUsersAll({
        active: true,
        type: 'attendant',
        limitPerPage: 100,
        maxPages: 20,
      }),
      this.tiflux.getUsersAll({
        active: true,
        type: 'admin',
        limitPerPage: 100,
        maxPages: 10,
      }),
    ]);

    const byId = new Map<number, { id: number; name: string; email: string | null }>();
    for (const user of [...attendants, ...admins]) {
      const id = Number(user.id);
      if (!Number.isFinite(id) || id <= 0) continue;
      const name = String(user.name ?? '').trim();
      if (!name) continue;
      byId.set(id, {
        id,
        name,
        email: user.email != null ? String(user.email).trim() : null,
      });
    }

    return [...byId.values()].sort((a, b) =>
      a.name.localeCompare(b.name, 'pt-BR'),
    );
  }

  private buildClassificationTree(
    rows: Array<{
      id: string;
      name: string;
      level: number;
      active: boolean;
      sortOrder: number;
      parentId: string | null;
    }>,
  ) {
    type Node = {
      id: string;
      name: string;
      level: number;
      active: boolean;
      sortOrder: number;
      parentId: string | null;
      children: Node[];
    };

    const byParent = new Map<string | null, typeof rows>();
    for (const row of rows) {
      const bucket = byParent.get(row.parentId);
      if (bucket) bucket.push(row);
      else byParent.set(row.parentId, [row]);
    }

    const sortRows = (list: typeof rows) =>
      [...list].sort(
        (a, b) =>
          a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'pt-BR'),
      );

    const toNode = (row: (typeof rows)[number]): Node => ({
      ...row,
      children:
        row.level < 3
          ? sortRows(byParent.get(row.id) ?? []).map(toNode)
          : [],
    });

    return sortRows(byParent.get(null) ?? []).map(toNode);
  }

  private async findPortalDeskForTifluxDesk(
    tifluxDeskId: number,
    tifluxDeskName?: string | null,
  ) {
    const candidates: Array<{ id: string; name: string }> = [];

    const byExternalId = await this.prisma.serviceDesk.findFirst({
      where: { externalId: tifluxDeskId, deletedAt: null, active: true },
      select: { id: true, name: true },
    });
    if (byExternalId) candidates.push(byExternalId);

    const normalizedTarget = normalizeDeskName(tifluxDeskName);
    if (normalizedTarget) {
      const portalDesks = await this.prisma.serviceDesk.findMany({
        where: { deletedAt: null, active: true },
        select: { id: true, name: true },
      });
      const byName = portalDesks.find(
        (desk) => normalizeDeskName(desk.name) === normalizedTarget,
      );
      if (byName && !candidates.some((desk) => desk.id === byName.id)) {
        candidates.push(byName);
      }
    }

    if (candidates.length === 0) return null;

    const withCounts = await Promise.all(
      candidates.map(async (desk) => ({
        desk,
        count: await this.prisma.serviceDeskClassification.count({
          where: { serviceDeskId: desk.id, active: true },
        }),
      })),
    );

    const withClassifications = withCounts.filter((row) => row.count > 0);
    if (withClassifications.length > 0) {
      return withClassifications[0].desk;
    }

    return candidates[0];
  }

  private async loadClassificationBundle(
    tifluxDeskId: number,
    tifluxDeskName?: string | null,
  ) {
    const portalDesk = await this.findPortalDeskForTifluxDesk(
      tifluxDeskId,
      tifluxDeskName,
    );
    if (!portalDesk) {
      return { portalServiceDesk: null, classification: null };
    }

    const rows = await this.prisma.serviceDeskClassification.findMany({
      where: { serviceDeskId: portalDesk.id, active: true },
      orderBy: [{ level: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        level: true,
        active: true,
        sortOrder: true,
        parentId: true,
      },
    });

    return {
      portalServiceDesk: portalDesk,
      classification: {
        levelLabels: [
          { level: 1, label: 'Categoria' },
          { level: 2, label: 'Subcategoria' },
          { level: 3, label: 'Produto/solução' },
        ],
        tree: this.buildClassificationTree(rows),
      },
    };
  }

  private async resolveClassificationPathLabel(
    classificationId: string,
  ): Promise<string | null> {
    const row = await this.prisma.serviceDeskClassification.findFirst({
      where: { id: classificationId, active: true },
      select: { id: true, name: true, parentId: true, level: true },
    });
    if (!row) return null;

    const names: string[] = [row.name];
    let parentId = row.parentId;
    while (parentId) {
      const parent = await this.prisma.serviceDeskClassification.findUnique({
        where: { id: parentId },
        select: { name: true, parentId: true },
      });
      if (!parent) break;
      names.unshift(parent.name);
      parentId = parent.parentId;
    }

    const desk = await this.prisma.serviceDeskClassification.findUnique({
      where: { id: row.id },
      select: {
        serviceDesk: { select: { name: true } },
      },
    });

    if (desk?.serviceDesk?.name) {
      names.unshift(desk.serviceDesk.name);
    }

    return names.join(' → ');
  }

  private async assertValidClassificationForDesk(
    tifluxDeskId: number,
    classificationId?: string | null,
    tifluxDeskName?: string | null,
  ) {
    const bundle = await this.loadClassificationBundle(
      tifluxDeskId,
      tifluxDeskName,
    );
    const tree = bundle.classification?.tree ?? [];
    if (tree.length === 0) {
      return;
    }

    if (!classificationId?.trim()) {
      throw new BadRequestException(
        'Selecione a classificação cadastrada para esta mesa.',
      );
    }

    const node = await this.prisma.serviceDeskClassification.findFirst({
      where: {
        id: classificationId,
        active: true,
        serviceDeskId: bundle.portalServiceDesk?.id,
      },
      select: { id: true, level: true },
    });
    if (!node) {
      throw new BadRequestException('Classificação inválida para esta mesa.');
    }

    const hasChildren = await this.prisma.serviceDeskClassification.count({
      where: { parentId: node.id, active: true },
    });
    if (hasChildren > 0) {
      throw new BadRequestException(
        'Selecione o nível mais específico da classificação.',
      );
    }
  }

  private async resolveTifluxExternalIdForUser(
    email: string,
  ): Promise<{ externalId: number; name: string | null } | null> {
    const normalized = this.normalizeEmail(email);
    const rows =
      (await this.prisma.$queryRaw<
        Array<{ external_id: number; name: string | null }>
      >`
        SELECT tu.external_id, tu.name
        FROM tiflux.users tu
        WHERE lower(trim(tu.email)) = ${normalized}
          AND COALESCE(tu.active, true) = true
        ORDER BY tu.external_id ASC
        LIMIT 1
      `) ?? [];
    const row = rows[0];
    if (!row) return null;
    return {
      externalId: Number(row.external_id),
      name: row.name,
    };
  }

  private valorizationLabel(raw: unknown): string | null {
    if (!raw || typeof raw !== 'object') return null;
    const v = raw as Record<string, unknown>;
    const candidates = [
      (v.loose_service as { name?: unknown } | undefined)?.name,
      (v.contract as { name?: unknown } | undefined)?.name,
      (v.service as { name?: unknown } | undefined)?.name,
      v.name,
    ];
    for (const candidate of candidates) {
      const name = String(candidate ?? '').trim();
      if (name) return name;
    }
    return null;
  }

  private appointmentMinutes(
    initTime: Date | null,
    endTime: Date | null,
  ): number {
    if (!initTime || !endTime) return 0;
    const start = initTime.getUTCHours() * 60 + initTime.getUTCMinutes();
    const end = endTime.getUTCHours() * 60 + endTime.getUTCMinutes();
    return Math.max(0, end - start);
  }

  private appointmentMinutesFromStrings(
    initTime: string | null,
    endTime: string | null,
  ): number {
    const parse = (value: string | null) => {
      if (!value) return null;
      const [h, m] = value.split(':').map((part) => Number(part));
      if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
      return h * 60 + m;
    };
    const start = parse(initTime);
    const end = parse(endTime);
    if (start == null || end == null) return 0;
    return Math.max(0, end - start);
  }

  private attendanceLabel(value: string | null | undefined): string | null {
    if (!value) return null;
    return ATTENDANCE_LABELS[value] ?? value;
  }

  private mapListItem(row: TicketRow): TicketListItemDto {
    return {
      ticketNumber: Number(row.ticket_number),
      title: row.title,
      clientName: row.client_name,
      origin: row.created_by_way_of,
      priorityName: row.priority_name,
      statusName: row.status_name,
      stageName: row.stage_name,
      responsibleName: row.responsible_name,
      createdAt: this.toIso(row.created_at_source),
      updatedAt: this.toIso(row.updated_at_source),
      stageGroup: resolveTicketStageGroup(row.stage_name),
      externalGmudRef: row.external_gmud_ref?.trim() || null,
    };
  }

  private buildDetailSummary(appointments: TicketAppointmentDto[]) {
    const totalMinutes = appointments.reduce((sum, a) => sum + a.minutes, 0);
    const attendants = new Set(
      appointments.map((a) => a.userName).filter(Boolean),
    );

    return {
      attendantsCount: attendants.size,
      totalMinutes,
      totalHoursFormatted: `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`,
      appointmentsCount: appointments.length,
    };
  }

  private async getDetailFromTifluxApi(ticketNumber: number) {
    const apiTicket = await this.tiflux.getTicket(ticketNumber);
    if (!apiTicket) {
      throw new NotFoundException('Ticket não encontrado.');
    }

    const [appointments, externalGmudRef, portalDescription] = await Promise.all([
      this.listMergedAppointments(ticketNumber),
      this.loadExternalGmudRef(ticketNumber),
      this.loadPortalTicketDescription(ticketNumber),
    ]);

    const stageName = apiTicket.stage?.name ?? null;
    const createdByWayOf =
      typeof apiTicket.created_by_way_of === 'string'
        ? apiTicket.created_by_way_of
        : null;

    return {
      ticket: {
        ticketNumber: apiTicket.ticket_number,
        title: apiTicket.title ?? null,
        clientName: apiTicket.client?.name ?? null,
        clientExternalId: apiTicket.client?.id ?? null,
        origin: createdByWayOf,
        priorityName: apiTicket.priority?.name ?? null,
        statusName: apiTicket.status?.name ?? null,
        stageName,
        responsibleName: apiTicket.responsible?.name ?? null,
        deskName: apiTicket.desk?.name ?? null,
        deskExternalId: apiTicket.desk?.id ?? null,
        createdAt: apiTicket.created_at ?? null,
        updatedAt: apiTicket.updated_at ?? null,
        isClosed: Boolean(apiTicket.is_closed),
        requestorName: apiTicket.requestor?.name ?? null,
        requestorEmail: apiTicket.requestor?.email ?? null,
        requestorTelephone: apiTicket.requestor?.telephone ?? null,
        stageGroup: resolveTicketStageGroup(stageName),
        externalGmudRef: externalGmudRef?.trim() || null,
      },
      summary: this.buildDetailSummary(appointments),
      appointments,
      externalGmudRef,
      portalDescription,
      syncPending: true,
    };
  }

  private normalizeExternalGmudRef(value: string | null | undefined) {
    const trimmed = value?.trim() ?? '';
    if (!trimmed) return null;
    if (trimmed.length > 120) {
      throw new BadRequestException(
        'Referência GMUD externa deve ter no máximo 120 caracteres.',
      );
    }
    return trimmed;
  }

  private async loadExternalGmudRef(ticketNumber: number) {
    const link = await this.prisma.portalTicketGmudLink.findUnique({
      where: { ticketNumber },
      select: { externalGmudRef: true },
    });
    const ref = link?.externalGmudRef?.trim();
    return ref || null;
  }

  private async upsertTicketGmudLink(
    actor: AuthenticatedRequestUser,
    ticketNumber: number,
    externalGmudRef: string,
  ) {
    await this.prisma.portalTicketGmudLink.upsert({
      where: { ticketNumber },
      create: {
        ticketNumber,
        externalGmudRef,
        createdBy: actor.userId,
      },
      update: { externalGmudRef },
    });
  }

  async listGrouped(
    actor: AuthenticatedRequestUser,
    query: TicketsListQueryDto,
  ) {
    const limit = Math.min(Math.max(query.limit ?? 300, 1), 500);
    const mineOnly = query.mineOnly !== false;

    let responsibleFilter: number | null = null;
    let responsibleName: string | null = null;

    if (mineOnly) {
      const mine = await this.resolveTifluxExternalIdForUser(actor.email);
      if (!mine) {
        return {
          total: 0,
          mineOnly: true,
          responsibleExternalId: null,
          responsibleName: null,
          tifluxUserResolved: false,
          message:
            'Seu e-mail não está vinculado a um usuário TiFlux. Use a busca avançada para consultar outros tickets.',
          groups: [],
        };
      }
      responsibleFilter = mine.externalId;
      responsibleName = mine.name;
    } else {
      responsibleFilter = query.responsibleExternalId ?? null;
      if (responsibleFilter != null) {
        const rows =
          (await this.prisma.$queryRaw<Array<{ name: string | null }>>`
            SELECT tu.name
            FROM tiflux.users tu
            WHERE tu.external_id = ${responsibleFilter}
            LIMIT 1
          `) ?? [];
        responsibleName = rows[0]?.name ?? null;
      }
    }

    const fromDate = query.from?.trim() ? new Date(`${query.from}T00:00:00`) : null;
    const toDate = query.to?.trim() ? new Date(`${query.to}T23:59:59`) : null;
    const search = query.search?.trim() ?? '';
    const ticketNumberFilter = query.ticketNumber ?? null;
    const externalGmudRefFilter = query.externalGmudRef?.trim() ?? '';

    const rows =
      mineOnly
        ? ((await this.prisma.$queryRaw<TicketRow[]>`
            SELECT
              t.ticket_number,
              t.title,
              t.client_name,
              t.client_external_id,
              t.created_by_way_of,
              t.priority_name,
              t.status_name,
              t.stage_name,
              t.responsible_external_id,
              t.responsible_name,
              t.desk_name,
              t.created_at_source,
              t.updated_at_source,
              t.is_closed,
              l.external_gmud_ref
            FROM tiflux.tickets t
            LEFT JOIN portal_ticket_gmud_links l ON l.ticket_number = t.ticket_number
            WHERE COALESCE(t.is_closed, false) = false
              AND t.responsible_external_id = ${responsibleFilter}
              AND (${query.clientExternalId ?? null}::int IS NULL OR t.client_external_id = ${query.clientExternalId ?? null})
              AND (${query.stageName ?? null}::text IS NULL OR t.stage_name ILIKE ${query.stageName ? `%${query.stageName}%` : null})
              AND (${query.statusName ?? null}::text IS NULL OR t.status_name ILIKE ${query.statusName ? `%${query.statusName}%` : null})
              AND (${query.deskName ?? null}::text IS NULL OR t.desk_name ILIKE ${query.deskName ? `%${query.deskName}%` : null})
              AND (${fromDate}::timestamptz IS NULL OR t.created_at_source >= ${fromDate})
              AND (${toDate}::timestamptz IS NULL OR t.created_at_source <= ${toDate})
              AND (${ticketNumberFilter}::int IS NULL OR t.ticket_number = ${ticketNumberFilter})
              AND (${externalGmudRefFilter}::text = '' OR l.external_gmud_ref ILIKE ${externalGmudRefFilter ? `%${externalGmudRefFilter}%` : ''})
              AND (
                ${search}::text = ''
                OR t.title ILIKE ${search ? `%${search}%` : ''}
                OR CAST(t.ticket_number AS text) ILIKE ${search ? `%${search}%` : ''}
              )
            ORDER BY t.updated_at_source DESC NULLS LAST, t.ticket_number DESC
            LIMIT ${limit}
          `) ?? [])
        : ((await this.prisma.$queryRaw<TicketRow[]>`
            SELECT
              t.ticket_number,
              t.title,
              t.client_name,
              t.client_external_id,
              t.created_by_way_of,
              t.priority_name,
              t.status_name,
              t.stage_name,
              t.responsible_external_id,
              t.responsible_name,
              t.desk_name,
              t.created_at_source,
              t.updated_at_source,
              t.is_closed,
              l.external_gmud_ref
            FROM tiflux.tickets t
            LEFT JOIN portal_ticket_gmud_links l ON l.ticket_number = t.ticket_number
            WHERE COALESCE(t.is_closed, false) = false
              AND (${responsibleFilter}::int IS NULL OR t.responsible_external_id = ${responsibleFilter})
              AND (${query.clientExternalId ?? null}::int IS NULL OR t.client_external_id = ${query.clientExternalId ?? null})
              AND (${query.stageName ?? null}::text IS NULL OR t.stage_name ILIKE ${query.stageName ? `%${query.stageName}%` : null})
              AND (${query.statusName ?? null}::text IS NULL OR t.status_name ILIKE ${query.statusName ? `%${query.statusName}%` : null})
              AND (${query.deskName ?? null}::text IS NULL OR t.desk_name ILIKE ${query.deskName ? `%${query.deskName}%` : null})
              AND (${fromDate}::timestamptz IS NULL OR t.created_at_source >= ${fromDate})
              AND (${toDate}::timestamptz IS NULL OR t.created_at_source <= ${toDate})
              AND (${ticketNumberFilter}::int IS NULL OR t.ticket_number = ${ticketNumberFilter})
              AND (${externalGmudRefFilter}::text = '' OR l.external_gmud_ref ILIKE ${externalGmudRefFilter ? `%${externalGmudRefFilter}%` : ''})
              AND (
                ${search}::text = ''
                OR t.title ILIKE ${search ? `%${search}%` : ''}
                OR CAST(t.ticket_number AS text) ILIKE ${search ? `%${search}%` : ''}
              )
            ORDER BY t.updated_at_source DESC NULLS LAST, t.ticket_number DESC
            LIMIT ${limit}
          `) ?? []);

    const seenTicketNumbers = new Set<number>();
    const uniqueRows = rows.filter((row) => {
      const ticketNumber = Number(row.ticket_number);
      if (!Number.isFinite(ticketNumber) || seenTicketNumbers.has(ticketNumber)) {
        return false;
      }
      seenTicketNumbers.add(ticketNumber);
      return true;
    });

    const groupedMap = new Map<TicketStageGroupKey, TicketListItemDto[]>();
    for (const def of TICKET_STAGE_GROUPS) {
      groupedMap.set(def.key, []);
    }

    for (const row of uniqueRows) {
      const item = this.mapListItem(row);
      groupedMap.get(item.stageGroup)?.push(item);
    }

    const groups = TICKET_STAGE_GROUPS.map((def) => ({
      key: def.key,
      label: def.label,
      tickets: groupedMap.get(def.key) ?? [],
    })).filter((g) => g.tickets.length > 0);

    return {
      total: uniqueRows.length,
      mineOnly,
      responsibleExternalId: responsibleFilter,
      responsibleName,
      tifluxUserResolved: true,
      message: null,
      groups,
    };
  }

  async getDetail(ticketNumber: number) {
    const rows =
      (await this.prisma.$queryRaw<TicketRow[]>`
        SELECT
          t.ticket_number,
          t.title,
          t.client_name,
          t.client_external_id,
          t.created_by_way_of,
          t.priority_name,
          t.status_name,
          t.stage_name,
          t.responsible_external_id,
          t.responsible_name,
          t.desk_name,
          t.desk_external_id,
          t.created_at_source,
          t.updated_at_source,
          t.is_closed,
          t.requestor_name,
          t.requestor_email,
          t.requestor_telephone
        FROM tiflux.tickets t
        WHERE t.ticket_number = ${ticketNumber}
        LIMIT 1
      `) ?? [];

    const row = rows[0] as (TicketRow & {
      requestor_name?: string | null;
      requestor_email?: string | null;
      requestor_telephone?: string | null;
    }) | undefined;

    if (!row) {
      return this.getDetailFromTifluxApi(ticketNumber);
    }

    const [appointments, externalGmudRef, portalDescription] = await Promise.all([
      this.listMergedAppointments(ticketNumber),
      this.loadExternalGmudRef(ticketNumber),
      this.loadPortalTicketDescription(ticketNumber),
    ]);

    return {
      ticket: {
        ...this.mapListItem(row),
        deskName: row.desk_name,
        deskExternalId: row.desk_external_id ?? null,
        clientExternalId: row.client_external_id ?? null,
        isClosed: Boolean(row.is_closed),
        requestorName: row.requestor_name ?? null,
        requestorEmail: row.requestor_email ?? null,
        requestorTelephone: row.requestor_telephone ?? null,
      },
      summary: this.buildDetailSummary(appointments),
      appointments,
      externalGmudRef,
      portalDescription,
    };
  }

  async getTicketHistory(ticketNumber: number): Promise<TicketHistoryDto[]> {
    const ticket = await this.getTicketContext(ticketNumber);
    if (!ticket) {
      throw new NotFoundException('Ticket não encontrado.');
    }

    await this.syncTifluxTicketHistory(ticketNumber).catch((err) => {
      this.logger.warn(
        `Falha ao sincronizar histórico TiFlux do ticket ${ticketNumber}: ${
          err instanceof Error ? err.message : err
        }`,
      );
    });

    type HistoryEvent = TicketHistoryDto & { sortAt: Date };
    const events: HistoryEvent[] = [];

    const metaRows =
      (await this.prisma.$queryRaw<
        Array<{
          created_at_source: Date | null;
          updated_at_source: Date | null;
          stage_name: string | null;
        }>
      >`
        SELECT t.created_at_source, t.updated_at_source, t.stage_name
        FROM tiflux.tickets t
        WHERE t.ticket_number = ${ticketNumber}
        LIMIT 1
      `) ?? [];
    const meta = metaRows[0];
    const createdAtSource = meta?.created_at_source
      ? new Date(meta.created_at_source)
      : null;
    if (createdAtSource && !Number.isNaN(createdAtSource.getTime())) {
      events.push({
        id: `ticket-created-${ticketNumber}`,
        eventType: 'TICKET_CREATED',
        summary: 'Ticket registrado no TiFlux',
        actorName: null,
        createdAt: createdAtSource.toISOString(),
        sortAt: createdAtSource,
      });
    }
    const updatedAtSource = meta?.updated_at_source
      ? new Date(meta.updated_at_source)
      : null;
    if (
      updatedAtSource &&
      !Number.isNaN(updatedAtSource.getTime()) &&
      (!createdAtSource ||
        updatedAtSource.getTime() - createdAtSource.getTime() > 60_000)
    ) {
      events.push({
        id: `ticket-updated-${ticketNumber}-${updatedAtSource.getTime()}`,
        eventType: 'TICKET_UPDATED',
        summary: `Ticket atualizado no TiFlux${
          meta?.stage_name ? ` · estágio: ${meta.stage_name}` : ''
        }`,
        actorName: null,
        createdAt: updatedAtSource.toISOString(),
        sortAt: updatedAtSource,
      });
    }

    const cachedTiflux = await this.prisma.ticketHistory.findMany({
      where: { ticketNumber },
      orderBy: { occurredAt: 'desc' },
    });
    for (const row of cachedTiflux) {
      events.push({
        id: `tiflux-cache-${row.id}`,
        eventType: row.eventType,
        summary: row.summary,
        actorName: row.actorName,
        createdAt: row.occurredAt.toISOString(),
        sortAt: row.occurredAt,
      });
    }

    const portalAppointments = await this.prisma.portalTicketAppointment.findMany({
      where: { ticketNumber },
      include: { creator: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    const claimedTifluxExternalIds = new Set<number>();
    for (const appt of portalAppointments) {
      if (appt.tifluxAppointmentExternalId != null) {
        claimedTifluxExternalIds.add(appt.tifluxAppointmentExternalId);
      }
      const dateLabel = this.formatDateOnly(appt.appointmentDate) ?? '';
      events.push({
        id: `appt-${appt.id}`,
        eventType: 'APPOINTMENT_CREATED',
        summary: `Apontamento ${appt.initTime}–${appt.endTime}${dateLabel ? ` em ${dateLabel}` : ''}`,
        actorName: appt.creator.name,
        createdAt: appt.createdAt.toISOString(),
        sortAt: appt.createdAt,
      });
    }

    const tifluxApptRows =
      (await this.prisma.$queryRaw<AppointmentRow[]>`
        SELECT
          a.external_id,
          a.ticket_number,
          a.appointment_date,
          a.init_time,
          a.end_time,
          a.user_external_id,
          a.user_name,
          a.description,
          a.valorization_raw
        FROM tiflux.ticket_appointments a
        WHERE a.ticket_number = ${ticketNumber}
        ORDER BY a.appointment_date DESC, a.init_time DESC NULLS LAST
      `) ?? [];
    for (const row of tifluxApptRows) {
      const externalId = Number(row.external_id);
      if (claimedTifluxExternalIds.has(externalId)) continue;
      const dateLabel = this.formatDateOnly(row.appointment_date) ?? '';
      const init = this.formatTime(row.init_time);
      const end = this.formatTime(row.end_time);
      const sortAt = row.appointment_date
        ? new Date(row.appointment_date)
        : new Date();
      events.push({
        id: `tiflux-appt-${externalId}`,
        eventType: 'APPOINTMENT_TIFLUX',
        summary: `Apontamento TiFlux ${init ?? '—'}–${end ?? '—'}${
          dateLabel ? ` em ${dateLabel}` : ''
        }`,
        actorName: row.user_name,
        createdAt: sortAt.toISOString(),
        sortAt,
      });
    }

    const gmud = await this.prisma.portalTicketGmudLink.findUnique({
      where: { ticketNumber },
      include: { creator: { select: { name: true } } },
    });
    if (gmud) {
      events.push({
        id: `gmud-${ticketNumber}`,
        eventType: 'GMUD_LINKED',
        summary: `GMUD vinculada: ${gmud.externalGmudRef}`,
        actorName: gmud.creator.name,
        createdAt: gmud.createdAt.toISOString(),
        sortAt: gmud.createdAt,
      });
      if (gmud.updatedAt.getTime() - gmud.createdAt.getTime() > 1000) {
        events.push({
          id: `gmud-updated-${ticketNumber}`,
          eventType: 'GMUD_UPDATED',
          summary: `GMUD atualizada: ${gmud.externalGmudRef}`,
          actorName: gmud.creator.name,
          createdAt: gmud.updatedAt.toISOString(),
          sortAt: gmud.updatedAt,
        });
      }
    }

    const project = await this.prisma.project.findFirst({
      where: { ticketNumber, deletedAt: null },
      select: { id: true, code: true, name: true, createdAt: true },
    });
    if (project) {
      events.push({
        id: `project-${project.id}`,
        eventType: 'PROJECT_LINKED',
        summary: `Projeto #${project.code} — ${project.name}`,
        actorName: null,
        createdAt: project.createdAt.toISOString(),
        sortAt: project.createdAt,
      });

      const projectHistory = await this.prisma.projectHistory.findMany({
        where: {
          projectId: project.id,
          eventType: 'APPOINTMENT_LINKED',
        },
        include: { actor: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
      });
      for (const entry of projectHistory) {
        events.push({
          id: `project-hist-${entry.id}`,
          eventType: 'PROJECT_APPOINTMENT_LINKED',
          summary: entry.summary,
          actorName: entry.actor?.name ?? null,
          createdAt: entry.createdAt.toISOString(),
          sortAt: entry.createdAt,
        });
      }
    }

    const auditRows = await this.prisma.auditLog.findMany({
      where: { entity: 'Ticket', entityId: String(ticketNumber) },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    for (const log of auditRows) {
      const payload = (log.payload ?? {}) as Record<string, unknown>;
      let summary = String(payload.message ?? '').trim();
      if (log.action === 'STAGE_CHANGED') {
        summary = `Estágio alterado: ${payload.fromStageName ?? '—'} → ${payload.toStageName ?? '—'}`;
      }
      events.push({
        id: `audit-${log.id}`,
        eventType: log.action,
        summary: summary || log.action,
        actorName: log.user?.name ?? null,
        createdAt: log.createdAt.toISOString(),
        sortAt: log.createdAt,
      });
    }

    return events
      .sort((a, b) => b.sortAt.getTime() - a.sortAt.getTime())
      .map(({ sortAt: _sortAt, ...entry }) => entry);
  }

  private async syncTifluxTicketHistory(ticketNumber: number): Promise<void> {
    if (!this.allowRuntimeTifluxApi) {
      return;
    }

    const recent = await this.prisma.ticketHistory.findFirst({
      where: { ticketNumber, source: 'TIFLUX' },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (recent && Date.now() - recent.createdAt.getTime() < 60 * 60 * 1000) {
      return;
    }

    const rows = await this.tiflux.getTicketHistories(ticketNumber);
    for (const raw of rows) {
      const mapped = this.mapTifluxHistoryRow(raw);
      if (!mapped) continue;

      const existing = mapped.externalKey
        ? await this.prisma.ticketHistory.findFirst({
            where: {
              ticketNumber,
              source: 'TIFLUX',
              externalKey: mapped.externalKey,
            },
            select: { id: true },
          })
        : null;

      const data = {
        ticketNumber,
        eventType: mapped.eventType,
        summary: mapped.summary,
        actorName: mapped.actorName,
        source: 'TIFLUX',
        externalKey: mapped.externalKey,
        payload: mapped.payload as object,
        occurredAt: mapped.occurredAt,
      };

      if (existing) {
        await this.prisma.ticketHistory.update({
          where: { id: existing.id },
          data,
        });
      } else {
        await this.prisma.ticketHistory.create({ data });
      }
    }
  }

  private mapTifluxHistoryRow(raw: Record<string, unknown>): {
    eventType: string;
    summary: string;
    actorName: string | null;
    externalKey: string;
    payload: Record<string, unknown>;
    occurredAt: Date;
  } | null {
    const occurredRaw =
      raw.created_at ??
      raw.date ??
      raw.occurred_at ??
      raw.updated_at ??
      raw.timestamp;
    const occurredAt = occurredRaw ? new Date(String(occurredRaw)) : null;
    if (!occurredAt || Number.isNaN(occurredAt.getTime())) {
      return null;
    }

    const actorName = this.extractTifluxActorName(raw);
    const action = String(
      raw.action ?? raw.action_type ?? raw.type ?? raw.kind ?? '',
    ).toLowerCase();

    let eventType = 'TIFLUX_EVENT';
    if (
      action.includes('stage') ||
      action.includes('estagio') ||
      action.includes('estágio')
    ) {
      eventType = 'STAGE_CHANGED';
    } else if (
      action.includes('appointment') ||
      action.includes('apontamento')
    ) {
      eventType = 'APPOINTMENT_CREATED';
    }

    let summary = String(
      raw.description ?? raw.summary ?? raw.message ?? raw.title ?? '',
    ).trim();
    if (!summary) {
      const fromStage = raw.from_stage ?? raw.previous_stage;
      const toStage = raw.to_stage ?? raw.stage ?? raw.current_stage;
      if (fromStage != null || toStage != null) {
        const fromLabel =
          typeof fromStage === 'object' && fromStage && 'name' in fromStage
            ? String((fromStage as { name?: string }).name ?? '—')
            : String(fromStage ?? '—');
        const toLabel =
          typeof toStage === 'object' && toStage && 'name' in toStage
            ? String((toStage as { name?: string }).name ?? '—')
            : String(toStage ?? '—');
        summary = `Estágio alterado: ${fromLabel} → ${toLabel}`;
        eventType = 'STAGE_CHANGED';
      }
    }
    if (!summary) {
      summary =
        eventType === 'STAGE_CHANGED'
          ? 'Estágio alterado no TiFlux'
          : 'Evento registrado no TiFlux';
    }

    const externalKey =
      raw.id != null
        ? String(raw.id)
        : `${eventType}:${occurredAt.toISOString()}:${summary.slice(0, 120)}`;

    return {
      eventType,
      summary,
      actorName,
      externalKey,
      payload: raw,
      occurredAt,
    };
  }

  private extractTifluxActorName(raw: Record<string, unknown>): string | null {
    const candidates = [
      raw.user,
      raw.author,
      raw.responsible,
      raw.created_by,
      raw.updated_by,
      raw.actor,
    ];
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim();
      }
      if (candidate && typeof candidate === 'object' && 'name' in candidate) {
        const name = String((candidate as { name?: string }).name ?? '').trim();
        if (name) return name;
      }
    }
    return null;
  }

  async linkTicketGmud(
    actor: AuthenticatedRequestUser,
    ticketNumber: number,
    externalGmudRef: string | null | undefined,
  ) {
    const rows =
      (await this.prisma.$queryRaw<Array<{ ticket_number: number }>>`
        SELECT t.ticket_number
        FROM tiflux.tickets t
        WHERE t.ticket_number = ${ticketNumber}
        LIMIT 1
      `) ?? [];

    if (!rows[0]) {
      throw new NotFoundException('Ticket não encontrado.');
    }

    if (externalGmudRef === undefined) {
      throw new BadRequestException(
        'Informe externalGmudRef (referência do cliente) ou null para remover o vínculo.',
      );
    }

    const normalized = this.normalizeExternalGmudRef(externalGmudRef);
    if (!normalized) {
      await this.prisma.portalTicketGmudLink.deleteMany({
        where: { ticketNumber },
      });
      return { ok: true, externalGmudRef: null };
    }

    await this.upsertTicketGmudLink(actor, ticketNumber, normalized);
    return { ok: true, externalGmudRef: normalized };
  }

  async listAppointments(ticketNumber: number): Promise<TicketAppointmentDto[]> {
    const rows =
      (await this.prisma.$queryRaw<AppointmentRow[]>`
        SELECT
          a.external_id,
          a.ticket_number,
          a.appointment_date,
          a.init_time,
          a.end_time,
          a.user_external_id,
          a.user_name,
          a.description,
          a.valorization_raw
        FROM tiflux.ticket_appointments a
        WHERE a.ticket_number = ${ticketNumber}
        ORDER BY a.appointment_date DESC, a.init_time DESC NULLS LAST
      `) ?? [];

    return rows.map((row) => ({
      externalId: Number(row.external_id),
      portalAppointmentId: null,
      appointmentDate: this.formatDateOnly(row.appointment_date),
      initTime: this.formatTime(row.init_time),
      endTime: this.formatTime(row.end_time),
      minutes: this.appointmentMinutes(row.init_time, row.end_time),
      userName: row.user_name,
      description: row.description,
      valorizationLabel: this.valorizationLabel(row.valorization_raw),
      attendance: null,
      attendanceLabel: null,
      syncStatus: 'SYNCED' as const,
      attachmentCount: 0,
      attachments: [],
    }));
  }

  private buildPreviewDataUrl(
    previewDataBase64: string | null | undefined,
    file: { mimeType: string; path: string },
  ): string | null {
    if (previewDataBase64?.trim()) {
      return `data:${file.mimeType};base64,${previewDataBase64.trim()}`;
    }
    if (!file.mimeType.startsWith('image/') || !existsSync(file.path)) {
      return null;
    }
    try {
      const buffer = readFileSync(file.path);
      if (buffer.length < 12) return null;
      return `data:${file.mimeType};base64,${buffer.toString('base64')}`;
    } catch {
      return null;
    }
  }

  private async loadAttachmentPreviewMap(
    attachmentIds: string[],
  ): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (!attachmentIds.length) return map;

    const rows = await this.prisma.portalTicketAppointmentAttachment.findMany({
      where: { id: { in: attachmentIds } },
      select: { id: true, previewDataBase64: true },
    });

    for (const row of rows) {
      if (row.previewDataBase64?.trim()) {
        map.set(row.id, row.previewDataBase64.trim());
      }
    }
    return map;
  }

  private mapPortalAttachments(
    rows: Array<{
      id: string;
      fileId: string;
      file: {
        originalName: string;
        mimeType: string;
        size: number;
        path: string;
        deletedAt: Date | null;
      };
    }>,
    previewMap?: Map<string, string>,
  ) {
    return rows
      .filter((row) => !row.file.deletedAt)
      .map((row) => ({
        id: row.id,
        fileId: row.fileId,
        originalName: row.file.originalName,
        mimeType: row.file.mimeType,
        size: row.file.size,
        previewDataUrl: this.buildPreviewDataUrl(
          previewMap?.get(row.id) ?? null,
          row.file,
        ),
      }));
  }

  /** Portal (completo) + TiFlux sync: enriquece com dados do portal; anexos só no portal. */
  async listMergedAppointments(
    ticketNumber: number,
  ): Promise<TicketAppointmentDto[]> {
    const syncRows = await this.listAppointments(ticketNumber);

    let portalRows: Array<{
      id: string;
      appointmentDate: Date;
      initTime: string;
      endTime: string;
      description: string;
      serviceName: string;
      attendance: string;
      tifluxAppointmentExternalId: number | null;
      syncStatus: PortalTicketAppointmentSyncStatus;
      syncPausedAt: Date | null;
      creator: { name: string };
      attachments: Array<{
        id: string;
        fileId: string;
        file: {
          originalName: string;
          mimeType: string;
          size: number;
          path: string;
          deletedAt: Date | null;
        };
      }>;
    }> = [];

    try {
      portalRows = await this.prisma.portalTicketAppointment.findMany({
        where: { ticketNumber },
        include: {
          creator: { select: { name: true } },
          attachments: {
            include: { file: true },
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: [{ appointmentDate: 'desc' }, { initTime: 'desc' }],
      });
    } catch {
      return syncRows;
    }

    for (const portal of portalRows) {
      if (portal.tifluxAppointmentExternalId != null) continue;
      const portalDate = this.formatDateOnly(portal.appointmentDate);
      const match = syncRows.find(
        (sync) =>
          sync.appointmentDate === portalDate &&
          sync.initTime === portal.initTime &&
          sync.endTime === portal.endTime,
      );
      if (!match?.externalId) continue;

      try {
        await this.prisma.portalTicketAppointment.update({
          where: { id: portal.id },
          data: {
            tifluxAppointmentExternalId: match.externalId,
            syncStatus: PortalTicketAppointmentSyncStatus.SYNCED,
          },
        });
        portal.tifluxAppointmentExternalId = match.externalId;
        portal.syncStatus = PortalTicketAppointmentSyncStatus.SYNCED;
      } catch {
        /* tabela pode não existir ainda */
      }
    }

    const previewMap = await this.loadAttachmentPreviewMap(
      portalRows.flatMap((portal) => portal.attachments.map((item) => item.id)),
    );

    const portalByTifluxId = new Map(
      portalRows
        .filter((row) => row.tifluxAppointmentExternalId != null)
        .map((row) => [row.tifluxAppointmentExternalId!, row]),
    );
    const claimedPortalIds = new Set<string>();
    const merged: TicketAppointmentDto[] = [];

    for (const sync of syncRows) {
      const portal = sync.externalId
        ? portalByTifluxId.get(sync.externalId)
        : undefined;
      if (portal) claimedPortalIds.add(portal.id);

      merged.push({
        externalId: sync.externalId,
        portalAppointmentId: portal?.id ?? null,
        appointmentDate: sync.appointmentDate,
        initTime: sync.initTime,
        endTime: sync.endTime,
        minutes: sync.minutes,
        userName: sync.userName,
        description: portal?.description?.trim() || sync.description,
        valorizationLabel: portal?.serviceName ?? sync.valorizationLabel,
        attendance: portal?.attendance ?? null,
        attendanceLabel: this.attendanceLabel(portal?.attendance),
        syncStatus: portal ? 'SYNCED' : 'SYNCED',
        syncPaused: false,
        attachmentCount: portal?.attachments.length ?? 0,
        attachments: portal
          ? this.mapPortalAttachments(portal.attachments, previewMap)
          : [],
      });
    }

    for (const portal of portalRows) {
      if (claimedPortalIds.has(portal.id)) continue;
      const mappedAttachments = this.mapPortalAttachments(
        portal.attachments,
        previewMap,
      );

      merged.push({
        externalId: portal.tifluxAppointmentExternalId,
        portalAppointmentId: portal.id,
        appointmentDate: this.formatDateOnly(portal.appointmentDate),
        initTime: portal.initTime,
        endTime: portal.endTime,
        minutes: this.appointmentMinutesFromStrings(
          portal.initTime,
          portal.endTime,
        ),
        userName: portal.creator.name,
        description: portal.description,
        valorizationLabel: portal.serviceName,
        attendance: portal.attendance,
        attendanceLabel: this.attendanceLabel(portal.attendance),
        syncStatus:
          portal.syncStatus === PortalTicketAppointmentSyncStatus.PORTAL_ONLY
            ? 'PORTAL_ONLY'
            : portal.syncStatus === PortalTicketAppointmentSyncStatus.SYNCED
              ? 'SYNCED'
              : 'PENDING_TIFLUX',
        syncPaused: Boolean(portal.syncPausedAt),
        attachmentCount: mappedAttachments.length,
        attachments: mappedAttachments,
      });
    }

    return merged.sort((a, b) => {
      const dateCmp = String(b.appointmentDate ?? '').localeCompare(
        String(a.appointmentDate ?? ''),
      );
      if (dateCmp !== 0) return dateCmp;
      return String(b.initTime ?? '').localeCompare(String(a.initTime ?? ''));
    });
  }

  async getFilterCatalogs() {
    const [stages, clients, responsibles, desks, statuses] = await Promise.all([
      this.prisma.$queryRaw<Array<{ stage_name: string }>>`
        SELECT DISTINCT trim(t.stage_name) AS stage_name
        FROM tiflux.tickets t
        WHERE t.stage_name IS NOT NULL AND trim(t.stage_name) <> ''
          AND COALESCE(t.is_closed, false) = false
        ORDER BY stage_name ASC
        LIMIT 80
      `,
      this.prisma.$queryRaw<
        Array<{ client_external_id: number; client_name: string }>
      >`
        SELECT DISTINCT t.client_external_id, t.client_name
        FROM tiflux.tickets t
        WHERE t.client_external_id IS NOT NULL AND t.client_name IS NOT NULL
          AND COALESCE(t.is_closed, false) = false
        ORDER BY t.client_name ASC
        LIMIT 200
      `,
      this.prisma.$queryRaw<
        Array<{ external_id: number; name: string; email: string | null }>
      >`
        SELECT tu.external_id, tu.name, tu.email
        FROM tiflux.users tu
        WHERE COALESCE(tu.active, true) = true
          AND tu.type IN ('attendant', 'admin')
        ORDER BY tu.name ASC
        LIMIT 300
      `,
      this.prisma.$queryRaw<Array<{ desk_name: string }>>`
        SELECT DISTINCT trim(t.desk_name) AS desk_name
        FROM tiflux.tickets t
        WHERE t.desk_name IS NOT NULL AND trim(t.desk_name) <> ''
          AND COALESCE(t.is_closed, false) = false
        ORDER BY desk_name ASC
        LIMIT 50
      `,
      this.prisma.$queryRaw<Array<{ status_name: string }>>`
        SELECT DISTINCT trim(t.status_name) AS status_name
        FROM tiflux.tickets t
        WHERE t.status_name IS NOT NULL AND trim(t.status_name) <> ''
          AND COALESCE(t.is_closed, false) = false
        ORDER BY status_name ASC
        LIMIT 30
      `,
    ]);

    return {
      stages: stages.map((s) => s.stage_name),
      clients: clients.map((c) => ({
        externalId: Number(c.client_external_id),
        name: c.client_name,
      })),
      responsibles: responsibles.map((r) => ({
        externalId: Number(r.external_id),
        name: r.name,
        email: r.email,
      })),
      desks: desks.map((d) => d.desk_name),
      statuses: statuses.map((s) => s.status_name),
    };
  }

  private mapCatalogItem(row: Record<string, unknown>) {
    const id = Number(row.id);
    const name = String(row.name ?? row.display_name ?? '').trim();
    const catalog = row.catalog as { name?: string } | null | undefined;
    const area = row.area as { name?: string } | null | undefined;
    const parts = [catalog?.name, area?.name, name]
      .map((part) => String(part ?? '').trim())
      .filter(Boolean);
    return { id, name: parts.join(' → ') || name || `Item ${id}` };
  }

  async getCreateCatalogs(deskId?: number, clientId?: number) {
    const [clientsRaw, desksRaw, responsibles] = await Promise.all([
      this.tiflux.getClientsAll({ active: true, maxPages: 30 }),
      this.tiflux.getDesksAll({ active: true, maxPages: 10 }),
      this.listTifluxResponsiblesForTicketCreate(),
    ]);

    let requestors: Array<{
      id: number;
      name: string;
      email: string | null;
      telephone: string | null;
    }> = [];
    if (clientId != null && Number.isFinite(clientId)) {
      requestors = await this.tiflux.getClientRequestors(clientId);
    }

    let desk: Record<string, unknown> | null = null;
    let priorities: Array<{ id: number; name: string }> = [];
    let catalogItems: Array<{ id: number; name: string }> = [];
    let portalServiceDesk: { id: string; name: string } | null = null;
    let classification: {
      levelLabels: Array<{ level: number; label: string }>;
      tree: Array<{
        id: string;
        name: string;
        level: number;
        active: boolean;
        sortOrder: number;
        parentId: string | null;
        children: unknown[];
      }>;
    } | null = null;

    if (deskId != null && Number.isFinite(deskId)) {
      desk = await this.tiflux.getDesk(deskId);
      const tifluxDeskName = String(desk.display_name ?? desk.name ?? '');
      const bundle = await this.loadClassificationBundle(deskId, tifluxDeskName);
      portalServiceDesk = bundle.portalServiceDesk;
      classification = bundle.classification;

      const requiresCatalog = Boolean(desk.require_service_catalog_open_ticket);

      if (requiresCatalog) {
        const items = await this.tiflux.getDeskServicesCatalogItems(deskId);
        catalogItems = items.map((row) => this.mapCatalogItem(row));
      } else {
        const rows = await this.tiflux.getDeskPriorities(deskId);
        priorities = rows.map((row) => this.mapCatalogItem(row));
      }
    }

    return {
      clients: clientsRaw
        .map((c) => ({
          id: Number(c.id),
          name: String(c.name ?? c.social_name ?? `Cliente ${c.id}`),
        }))
        .filter((c) => Number.isFinite(c.id)),
      desks: desksRaw
        .map((d) => ({
          id: Number(d.id),
          name: String(d.display_name ?? d.name ?? `Mesa ${d.id}`),
          appointmentType: String(d.appointment_type ?? ''),
          requireServiceCatalog: Boolean(d.require_service_catalog_open_ticket),
        }))
        .filter((d) => Number.isFinite(d.id)),
      responsibles,
      requestors,
      portalServiceDesk,
      classification,
      desk: desk
        ? {
            id: Number(desk.id),
            name: String(desk.display_name ?? desk.name ?? ''),
            appointmentType: String(desk.appointment_type ?? ''),
            requireServiceCatalog: Boolean(desk.require_service_catalog_open_ticket),
            requiredFields: (desk.required_fields as Record<string, boolean> | null) ?? {},
          }
        : null,
      priorities,
      catalogItems,
    };
  }

  private async recordOutbox(params: {
    kind: PortalTifluxOutboxKind;
    status: PortalTifluxOutboxStatus;
    ticketNumber: number | null;
    tifluxExternalId: number | null;
    payload: unknown;
    errorMessage: string | null;
    createdBy: string;
  }): Promise<string> {
    const row = await this.prisma.portalTifluxOutbox.create({
      data: {
        kind: params.kind,
        status: params.status,
        ticketNumber: params.ticketNumber,
        tifluxExternalId: params.tifluxExternalId,
        payload: params.payload as object,
        errorMessage: params.errorMessage,
        createdBy: params.createdBy,
        syncedAt:
          params.status === PortalTifluxOutboxStatus.SYNCED
            ? new Date()
            : null,
      },
    });
    return row.id;
  }

  private async getTicketContext(ticketNumber: number) {
    const rows =
      (await this.prisma.$queryRaw<
        Array<{
          ticket_number: number;
          client_external_id: number | null;
          client_name: string | null;
          desk_external_id: number | null;
          desk_name: string | null;
          stage_name: string | null;
          is_closed: boolean | null;
        }>
      >`
        SELECT
          t.ticket_number,
          t.client_external_id,
          t.client_name,
          t.desk_external_id,
          t.desk_name,
          t.stage_name,
          t.is_closed
        FROM tiflux.tickets t
        WHERE t.ticket_number = ${ticketNumber}
        LIMIT 1
      `) ?? [];
    const row = rows[0] ?? null;
    if (row) {
      return row;
    }

    const apiTicket = await this.tiflux.getTicket(ticketNumber);
    if (!apiTicket) {
      return null;
    }

    return {
      ticket_number: apiTicket.ticket_number,
      client_external_id: apiTicket.client?.id ?? null,
      client_name: apiTicket.client?.name ?? null,
      desk_external_id: apiTicket.desk?.id ?? null,
      desk_name: apiTicket.desk?.name ?? null,
      stage_name: apiTicket.stage?.name ?? null,
      is_closed: Boolean(apiTicket.is_closed),
    };
  }

  async getAppointmentCatalogs(ticketNumber: number) {
    const ticket = await this.getTicketContext(ticketNumber);
    if (!ticket) {
      throw new NotFoundException('Ticket não encontrado.');
    }

    const clientId = ticket.client_external_id;

    const tifluxAppointmentSyncEnabled = isTifluxAppointmentSyncEnabled();
    const tifluxSyncAvailable =
      tifluxAppointmentSyncEnabled &&
      isAlleOneTifluxDesk(ticket.desk_external_id, ticket.desk_name);

    return {
      tifluxAppointmentSyncEnabled,
      ticket: {
        ticketNumber: ticket.ticket_number,
        clientName: ticket.client_name,
        clientExternalId: clientId,
        deskName: ticket.desk_name,
        deskExternalId: ticket.desk_external_id,
        appointmentType: '',
        tifluxSyncAvailable,
      },
      projectLink: await this.projetos.listActivitiesForTicket(ticketNumber),
      serviceTypes: ['HORA NORMAL', 'HORA EXTRA', 'PLANTÃO'],
      attendances: [
        { value: 'Remote', label: 'Remoto' },
        { value: 'External', label: 'Externo' },
        { value: 'Internal', label: 'Interno' },
      ],
    };
  }

  private mapDeskStageOptions(
    raw: Array<Record<string, unknown>>,
  ): Array<{
    id: number;
    name: string;
    firstStage: boolean;
    lastStage: boolean;
  }> {
    return raw
      .map((row) => ({
        id: Number(row.id),
        name: String(row.name ?? '').trim(),
        firstStage: Boolean(row.first_stage),
        lastStage: Boolean(row.last_stage),
      }))
      .filter((row) => Number.isFinite(row.id) && row.id > 0 && row.name.length > 0)
      .sort((a, b) => a.id - b.id);
  }

  private async resolveCurrentStageId(params: {
    ticketNumber: number;
    deskExternalId: number;
    stageName: string | null;
    stages: Array<{ id: number; name: string }>;
  }): Promise<number | null> {
    const apiTicket = await this.tiflux.getTicket(params.ticketNumber);
    const fromApi = Number(apiTicket?.stage?.id);
    if (Number.isFinite(fromApi) && fromApi > 0) {
      return fromApi;
    }

    const normalized = normalizeDeskName(params.stageName);
    if (!normalized) return null;

    const matched = params.stages.find(
      (stage) => normalizeDeskName(stage.name) === normalized,
    );
    return matched?.id ?? null;
  }

  private async patchLocalTicketStage(ticketNumber: number, stageName: string) {
    await this.prisma.$executeRawUnsafe(
      `
      UPDATE tiflux.tickets
      SET stage_name = $2::text
      WHERE ticket_number = $1
    `,
      ticketNumber,
      stageName,
    );
  }

  async listTicketStages(ticketNumber: number) {
    const ticket = await this.getTicketContext(ticketNumber);
    if (!ticket) {
      throw new NotFoundException('Ticket não encontrado.');
    }

    const deskExternalId = Number(ticket.desk_external_id);
    if (!Number.isFinite(deskExternalId) || deskExternalId <= 0) {
      throw new BadRequestException(
        'Ticket sem mesa de serviço vinculada no TiFlux.',
      );
    }

    const stages = this.mapDeskStageOptions(
      await this.tiflux.getDeskStages(deskExternalId),
    );
    const currentStageId = await this.resolveCurrentStageId({
      ticketNumber,
      deskExternalId,
      stageName: ticket.stage_name,
      stages,
    });

    return {
      deskExternalId,
      deskName: ticket.desk_name,
      currentStageId,
      currentStageName: ticket.stage_name,
      isClosed: Boolean(ticket.is_closed),
      stages,
    };
  }

  async updateTicketStage(
    actor: AuthenticatedRequestUser,
    ticketNumber: number,
    stageId: number,
  ) {
    const ticket = await this.getTicketContext(ticketNumber);
    if (!ticket) {
      throw new NotFoundException('Ticket não encontrado.');
    }

    if (ticket.is_closed) {
      throw new BadRequestException(
        'Não é possível alterar o estágio de um ticket fechado.',
      );
    }

    const deskExternalId = Number(ticket.desk_external_id);
    if (!Number.isFinite(deskExternalId) || deskExternalId <= 0) {
      throw new BadRequestException(
        'Ticket sem mesa de serviço vinculada no TiFlux.',
      );
    }

    const stages = this.mapDeskStageOptions(
      await this.tiflux.getDeskStages(deskExternalId),
    );
    const targetStage = stages.find((stage) => stage.id === stageId);
    if (!targetStage) {
      throw new BadRequestException(
        'Estágio inválido para a mesa de serviço deste ticket.',
      );
    }

    const currentStageId = await this.resolveCurrentStageId({
      ticketNumber,
      deskExternalId,
      stageName: ticket.stage_name,
      stages,
    });
    if (currentStageId === stageId) {
      return {
        ok: true,
        stageId: targetStage.id,
        stageName: targetStage.name,
        stageGroup: resolveTicketStageGroup(targetStage.name),
        message: 'O ticket já está neste estágio.',
      };
    }

    const updated = await this.tiflux.updateTicket(ticketNumber, {
      stage_id: stageId,
    });
    const stageName = updated.stage?.name ?? targetStage.name;
    await this.patchLocalTicketStage(ticketNumber, stageName);

    await this.audit.log({
      actor,
      action: 'STAGE_CHANGED',
      entity: 'Ticket',
      entityId: String(ticketNumber),
      payload: {
        fromStageName: ticket.stage_name,
        toStageName: stageName,
        stageId,
      },
    });

    return {
      ok: true,
      stageId: updated.stage?.id ?? stageId,
      stageName,
      stageGroup: resolveTicketStageGroup(stageName),
      message: `Estágio atualizado para "${stageName}".`,
    };
  }

  private async saveAppointmentFiles(
    actor: AuthenticatedRequestUser,
    ticketNumber: number,
    files: Express.Multer.File[],
    portalAppointmentId: string | null,
    outboxId: string | null,
    tifluxAppointmentExternalId: number | null,
  ) {
    if (!files.length) return [];

    const saved: Array<{
      id: string;
      fileId: string;
      originalName: string;
      mimeType: string;
      size: number;
      base64: string | null;
    }> = [];

    const seen = new Set<string>();
    const uniqueFiles = files.filter((file) => {
      const key = `${file.originalname}:${file.size}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    for (const file of uniqueFiles) {
      assertAllowedUploadMime(file.mimetype);
      if (file.size > TICKET_APPOINTMENT_UPLOAD_MAX_BYTES) {
        throw new BadRequestException(
          `Arquivo "${file.originalname}" excede o limite de 25MB.`,
        );
      }
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      const targetName = `${Date.now()}-${randomUUID()}-${safeName}`;
      const relativeKey = join('tickets', String(ticketNumber), targetName);
      const stored = await this.fileStorage.saveBuffer(relativeKey, file.buffer);
      const targetPath = stored.storagePath;

      const createdFile = await this.prisma.file.create({
        data: {
          originalName: file.originalname,
          mimeType: file.mimetype || 'application/octet-stream',
          path: targetPath,
          size: file.size,
          uploadedBy: actor.userId,
        },
      });

      const previewDataBase64 =
        file.mimetype?.startsWith('image/') && file.buffer.length > 0
          ? file.buffer.toString('base64')
          : null;

      const link = await this.prisma.portalTicketAppointmentAttachment.create({
        data: {
          ticketNumber,
          portalAppointmentId,
          outboxId,
          tifluxAppointmentExternalId,
          fileId: createdFile.id,
          createdBy: actor.userId,
        },
        include: { file: true },
      });

      if (previewDataBase64) {
        await this.prisma.$executeRaw`
          UPDATE portal_ticket_appointment_attachments
          SET preview_data_base64 = ${previewDataBase64}
          WHERE id = ${link.id}
        `;
      }

      saved.push({
        id: link.id,
        fileId: createdFile.id,
        originalName: createdFile.originalName,
        mimeType: createdFile.mimeType,
        size: createdFile.size,
        base64: previewDataBase64,
      });
    }

    return saved;
  }

  async listPortalAttachments(ticketNumber: number) {
    const rows = await this.prisma.portalTicketAppointmentAttachment.findMany({
      where: { ticketNumber },
      include: { file: true },
      orderBy: { createdAt: 'desc' },
    });

    return rows.map((row) => ({
      id: row.id,
      fileId: row.fileId,
      portalAppointmentId: row.portalAppointmentId,
      originalName: row.file.originalName,
      mimeType: row.file.mimeType,
      size: row.file.size,
      tifluxAppointmentExternalId: row.tifluxAppointmentExternalId,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async downloadPortalAttachment(fileId: string, inline: boolean) {
    const row = await this.prisma.portalTicketAppointmentAttachment.findFirst({
      where: { fileId },
      include: { file: true },
    });
    if (!row?.file || row.file.deletedAt) {
      throw new NotFoundException('Anexo não encontrado.');
    }

    if (!(await this.fileStorage.exists(row.file.path))) {
      throw new NotFoundException('Arquivo não encontrado no servidor.');
    }

    const buffer = await this.fileStorage.readBuffer(row.file.path);

    return {
      stream: new StreamableFile(buffer),
      meta: {
        originalName: row.file.originalName,
        mimeType: row.file.mimeType,
        inline,
      },
    };
  }

  async createTicket(
    actor: AuthenticatedRequestUser,
    dto: CreateTicketDto,
    files: Express.Multer.File[] = [],
  ) {
    const desk = await this.tiflux.getDesk(dto.deskId);
    const tifluxDeskName = String(desk.display_name ?? desk.name ?? '');
    const requiresCatalog = Boolean(desk.require_service_catalog_open_ticket);

    await this.assertValidClassificationForDesk(
      dto.deskId,
      dto.classificationId,
      tifluxDeskName,
    );

    if (requiresCatalog && !dto.servicesCatalogsItemId) {
      throw new BadRequestException(
        'Selecione o serviço do catálogo TiFlux.',
      );
    }
    if (!requiresCatalog && !dto.priorityId) {
      throw new BadRequestException(
        'Esta mesa exige uma prioridade.',
      );
    }

    const descriptionRaw = dto.description.trim();
    const descriptionPlain = appointmentDescriptionToPlainText(descriptionRaw);
    if (!descriptionPlain && files.length === 0) {
      throw new BadRequestException('Informe a descrição do chamado.');
    }

    const servicesCatalogsItemId =
      dto.servicesCatalogsItemId != null &&
      Number.isFinite(Number(dto.servicesCatalogsItemId))
        ? Number(dto.servicesCatalogsItemId)
        : null;

    const allowedResponsibles = await this.listTifluxResponsiblesForTicketCreate();
    let responsibleId = dto.responsibleId ?? null;
    if (responsibleId == null) {
      const mine = await this.resolveTifluxExternalIdForUser(actor.email);
      const mineAllowed = mine
        ? allowedResponsibles.some((row) => row.id === mine.externalId)
        : false;
      responsibleId = mineAllowed ? mine?.externalId ?? null : null;
    } else if (!allowedResponsibles.some((row) => row.id === responsibleId)) {
      throw new BadRequestException(
        'O responsável selecionado não é válido no TiFlux.',
      );
    }

    let tifluxDescription = descriptionPlain;
    if (dto.classificationId) {
      const pathLabel = await this.resolveClassificationPathLabel(
        dto.classificationId,
      );
      if (pathLabel) {
        tifluxDescription = `Classificação: ${pathLabel}\n\n${descriptionPlain}`;
      }
    }

    const payload = {
      title: dto.title.trim(),
      description: tifluxDescription,
      client_id: dto.clientId,
      desk_id: dto.deskId,
      priority_id: dto.priorityId ?? undefined,
      services_catalogs_item_id: servicesCatalogsItemId ?? undefined,
      responsible_id: responsibleId ?? undefined,
      requestor_id: dto.requestorId ?? undefined,
      requestor_name: dto.requestorName?.trim() || undefined,
      requestor_email: dto.requestorEmail?.trim() || undefined,
      requestor_telephone: dto.requestorTelephone?.trim() || undefined,
    };

    try {
      const raw = await this.tiflux.createTicket(payload);
      const ticketNumber = Number(
        (raw as { ticket?: { ticket_number?: number } })?.ticket?.ticket_number,
      );

      if (!Number.isFinite(ticketNumber)) {
        throw new BadGatewayException(
          'TiFlux não retornou o número do ticket criado.',
        );
      }

      await this.recordOutbox({
        kind: PortalTifluxOutboxKind.CREATE_TICKET,
        status: PortalTifluxOutboxStatus.SYNCED,
        ticketNumber,
        tifluxExternalId: null,
        payload,
        errorMessage: null,
        createdBy: actor.userId,
      });

      const externalGmudRef = this.normalizeExternalGmudRef(dto.externalGmudRef);
      if (externalGmudRef) {
        await this.upsertTicketGmudLink(actor, ticketNumber, externalGmudRef);
      }

      await this.savePortalTicketDescription(
        actor,
        ticketNumber,
        descriptionRaw,
        files,
      );

      return {
        ok: true,
        ticketNumber,
        message: 'Ticket criado com sucesso.',
        tiflux: raw,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Falha ao criar ticket no TiFlux.';

      await this.recordOutbox({
        kind: PortalTifluxOutboxKind.CREATE_TICKET,
        status: PortalTifluxOutboxStatus.FAILED,
        ticketNumber: null,
        tifluxExternalId: null,
        payload,
        errorMessage: message,
        createdBy: actor.userId,
      });

      if (error instanceof BadGatewayException) {
        throw new BadRequestException(error.message);
      }
      throw new BadGatewayException(message);
    }
  }

  private async savePortalTicketDescription(
    actor: AuthenticatedRequestUser,
    ticketNumber: number,
    descriptionRaw: string,
    files: Express.Multer.File[],
  ) {
    const attachments = await this.saveAppointmentFiles(
      actor,
      ticketNumber,
      files,
      null,
      null,
      null,
    );

    const savedImages: SavedAppointmentImage[] = attachments
      .filter(
        (item): item is typeof item & { base64: string } =>
          Boolean(item.base64?.trim()),
      )
      .map((item) => ({
        fileId: item.fileId,
        mimeType: item.mimeType,
        base64: item.base64,
      }));

    let description = descriptionRaw;
    if (savedImages.length > 0) {
      description = enrichAppointmentDescriptionWithImages(
        descriptionRaw,
        savedImages,
      );
    }

    await this.prisma.portalTicketDescription.upsert({
      where: { ticketNumber },
      create: {
        ticketNumber,
        description,
        createdBy: actor.userId,
      },
      update: {
        description,
      },
    });
  }

  private async loadPortalTicketDescription(ticketNumber: number) {
    try {
      const row = await this.prisma.portalTicketDescription.findUnique({
        where: { ticketNumber },
      });
      if (!row) return null;

      const attachmentRows =
        await this.prisma.portalTicketAppointmentAttachment.findMany({
          where: {
            ticketNumber,
            portalAppointmentId: null,
          },
          include: { file: true },
          orderBy: { createdAt: 'asc' },
        });

      const previewMap = await this.loadAttachmentPreviewMap(
        attachmentRows.map((item) => item.id),
      );

      return {
        description: row.description,
        attachments: this.mapPortalAttachments(attachmentRows, previewMap),
      };
    } catch {
      return null;
    }
  }

  private validateAppointmentDto(dto: CreateTicketAppointmentDto) {
    if (!dto.serviceName?.trim()) {
      throw new BadRequestException('Selecione o tipo de atendimento.');
    }
    const from = this.parseAppointmentTimeToMinutes(dto.initTime);
    const to = this.parseAppointmentTimeToMinutes(dto.endTime);
    if (to <= from) {
      throw new BadRequestException(
        'Horário final deve ser maior que o horário inicial.',
      );
    }
  }

  private parseAppointmentTimeToMinutes(value: string): number {
    const [h, m] = String(value ?? '')
      .trim()
      .split(':')
      .map((part) => Number(part));
    if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
    return h * 60 + m;
  }

  private async getPortalAppointmentOrThrow(
    ticketNumber: number,
    portalAppointmentId: string,
  ) {
    const row = await this.prisma.portalTicketAppointment.findFirst({
      where: { id: portalAppointmentId, ticketNumber },
      include: {
        outbox: true,
      },
    });
    if (!row) {
      throw new NotFoundException('Apontamento do portal não encontrado.');
    }
    return row;
  }

  private async appointmentExistsInTiflux(
    ticketNumber: number,
    externalId: number | null,
  ): Promise<boolean> {
    if (externalId == null || !Number.isFinite(externalId) || externalId <= 0) {
      return false;
    }

    const rows =
      (await this.prisma.$queryRaw<Array<{ ok: number }>>`
        SELECT 1 AS ok
        FROM tiflux.ticket_appointments
        WHERE ticket_number = ${ticketNumber}
          AND external_id = ${externalId}
        LIMIT 1
      `) ?? [];
    if (rows.length > 0) return true;

    try {
      const appointments = await this.tiflux.getTicketAppointments(ticketNumber, {
        limit: 200,
      });
      return appointments.some((item) => Number(item.id) === externalId);
    } catch {
      return false;
    }
  }

  async getPortalAppointmentEditContext(
    ticketNumber: number,
    portalAppointmentId: string,
  ) {
    const row = await this.getPortalAppointmentOrThrow(
      ticketNumber,
      portalAppointmentId,
    );
    const existsInTiflux = await this.appointmentExistsInTiflux(
      ticketNumber,
      row.tifluxAppointmentExternalId,
    );

    return {
      portalAppointmentId: row.id,
      ticketNumber: row.ticketNumber,
      date: this.formatDateOnly(row.appointmentDate),
      initTime: row.initTime,
      endTime: row.endTime,
      serviceName: row.serviceName,
      attendance: row.attendance,
      description: row.description,
      descriptionPlain: appointmentDescriptionToPlainText(row.description),
      syncStatus: row.syncStatus,
      syncPaused: Boolean(row.syncPausedAt),
      existsInTiflux,
      canPauseSync:
        row.syncStatus === PortalTicketAppointmentSyncStatus.PENDING_TIFLUX,
    };
  }

  async pausePortalAppointmentSync(
    ticketNumber: number,
    portalAppointmentId: string,
  ) {
    const row = await this.getPortalAppointmentOrThrow(
      ticketNumber,
      portalAppointmentId,
    );
    if (row.syncStatus !== PortalTicketAppointmentSyncStatus.PENDING_TIFLUX) {
      return { ok: true, syncPaused: false };
    }

    await this.prisma.portalTicketAppointment.update({
      where: { id: row.id },
      data: { syncPausedAt: new Date() },
    });

    return { ok: true, syncPaused: true };
  }

  async resumePortalAppointmentSync(
    ticketNumber: number,
    portalAppointmentId: string,
  ) {
    const row = await this.getPortalAppointmentOrThrow(
      ticketNumber,
      portalAppointmentId,
    );
    if (!row.syncPausedAt) {
      return { ok: true, syncPaused: false };
    }

    await this.prisma.portalTicketAppointment.update({
      where: { id: row.id },
      data: { syncPausedAt: null },
    });

    return { ok: true, syncPaused: false };
  }

  private async resetPortalAppointmentOutbox(params: {
    portalAppointmentId: string;
    ticketNumber: number;
    outboxId: string | null;
    payload: {
      date: string;
      init_time: string;
      end_time: string;
      description: string;
      serviceName: string;
      attendance: string;
    };
    createdBy: string;
  }): Promise<string> {
    const outboxPayload = {
      portalAppointmentId: params.portalAppointmentId,
      date: params.payload.date,
      init_time: params.payload.init_time,
      end_time: params.payload.end_time,
      description: params.payload.description,
      serviceName: params.payload.serviceName,
      attendance: params.payload.attendance,
    };

    if (params.outboxId) {
      await this.prisma.portalTifluxOutbox.update({
        where: { id: params.outboxId },
        data: {
          status: PortalTifluxOutboxStatus.PENDING,
          payload: outboxPayload,
          errorMessage: null,
          syncedAt: null,
        },
      });
      return params.outboxId;
    }

    return this.recordOutbox({
      kind: PortalTifluxOutboxKind.CREATE_APPOINTMENT,
      status: PortalTifluxOutboxStatus.PENDING,
      ticketNumber: params.ticketNumber,
      tifluxExternalId: null,
      payload: outboxPayload,
      errorMessage: null,
      createdBy: params.createdBy,
    });
  }

  async updatePortalAppointment(
    actor: AuthenticatedRequestUser,
    ticketNumber: number,
    portalAppointmentId: string,
    dto: CreateTicketAppointmentDto,
  ) {
    this.validateAppointmentDto(dto);

    const row = await this.getPortalAppointmentOrThrow(
      ticketNumber,
      portalAppointmentId,
    );
    const ticket = await this.getTicketContext(ticketNumber);
    if (!ticket) {
      throw new NotFoundException('Ticket não encontrado.');
    }

    const descriptionRaw = dto.description.trim();
    const descriptionPlain = appointmentDescriptionToPlainText(descriptionRaw);
    const syncToTiflux =
      row.syncStatus === PortalTicketAppointmentSyncStatus.PENDING_TIFLUX &&
      isTifluxAppointmentSyncEnabled() &&
      isAlleOneTifluxDesk(ticket.desk_external_id, ticket.desk_name);

    let outboxId = row.outboxId;
    if (syncToTiflux) {
      outboxId = await this.resetPortalAppointmentOutbox({
        portalAppointmentId: row.id,
        ticketNumber,
        outboxId: row.outboxId,
        payload: {
          date: dto.date,
          init_time: dto.initTime,
          end_time: dto.endTime,
          description: descriptionPlain,
          serviceName: dto.serviceName.trim(),
          attendance: dto.attendance,
        },
        createdBy: actor.userId,
      });
    }

    await this.prisma.portalTicketAppointment.update({
      where: { id: row.id },
      data: {
        appointmentDate: new Date(`${dto.date}T12:00:00.000Z`),
        initTime: dto.initTime,
        endTime: dto.endTime,
        description: descriptionRaw,
        serviceName: dto.serviceName.trim(),
        attendance: dto.attendance,
        syncPausedAt: null,
        outboxId,
      },
    });

    await this.projetos.refreshPortalAppointmentLink(
      row.id,
      dto.initTime,
      dto.endTime,
    );

    return {
      ok: true,
      message: syncToTiflux
        ? 'Apontamento atualizado no portal. Sincronização com TiFlux reiniciada.'
        : row.syncStatus === PortalTicketAppointmentSyncStatus.SYNCED
          ? 'Apontamento atualizado somente no portal. O registro no TiFlux não foi alterado.'
          : 'Apontamento atualizado no portal.',
    };
  }

  async deletePortalAppointment(
    ticketNumber: number,
    portalAppointmentId: string,
  ) {
    const row = await this.getPortalAppointmentOrThrow(
      ticketNumber,
      portalAppointmentId,
    );

    if (row.outboxId) {
      const outbox = await this.prisma.portalTifluxOutbox.findUnique({
        where: { id: row.outboxId },
        select: { status: true },
      });
      if (outbox?.status !== PortalTifluxOutboxStatus.SYNCED) {
        await this.prisma.portalTifluxOutbox.deleteMany({
          where: { id: row.outboxId },
        });
      }
    }

    await this.prisma.portalTicketAppointmentAttachment.deleteMany({
      where: { portalAppointmentId: row.id },
    });
    await this.projetos.handlePortalAppointmentDeleted(row.id);
    await this.prisma.portalTicketAppointment.delete({
      where: { id: row.id },
    });

    return {
      ok: true,
      message:
        row.syncStatus === PortalTicketAppointmentSyncStatus.SYNCED
          ? 'Apontamento removido do portal. O registro no TiFlux permanece inalterado.'
          : 'Apontamento excluído do portal.',
    };
  }

  async createAppointment(
    actor: AuthenticatedRequestUser,
    ticketNumber: number,
    dto: CreateTicketAppointmentDto,
    files: Express.Multer.File[] = [],
  ) {
    const ticket = await this.getTicketContext(ticketNumber);
    if (!ticket) {
      throw new NotFoundException('Ticket não encontrado.');
    }

    this.validateAppointmentDto(dto);

    const descriptionRaw = dto.description.trim();
    const descriptionPlain = appointmentDescriptionToPlainText(descriptionRaw);
    const syncToTiflux =
      isTifluxAppointmentSyncEnabled() &&
      isAlleOneTifluxDesk(ticket.desk_external_id, ticket.desk_name);

    const portalAppointment = await this.prisma.portalTicketAppointment.create({
      data: {
        ticketNumber,
        appointmentDate: new Date(`${dto.date}T12:00:00.000Z`),
        initTime: dto.initTime,
        endTime: dto.endTime,
        description: descriptionRaw,
        serviceName: dto.serviceName.trim(),
        attendance: dto.attendance,
        syncStatus: syncToTiflux
          ? PortalTicketAppointmentSyncStatus.PENDING_TIFLUX
          : PortalTicketAppointmentSyncStatus.PORTAL_ONLY,
        createdBy: actor.userId,
      },
    });

    let outboxId: string | null = null;
    if (syncToTiflux) {
      outboxId = await this.recordOutbox({
        kind: PortalTifluxOutboxKind.CREATE_APPOINTMENT,
        status: PortalTifluxOutboxStatus.PENDING,
        ticketNumber,
        tifluxExternalId: null,
        payload: {
          portalAppointmentId: portalAppointment.id,
          date: dto.date,
          init_time: dto.initTime,
          end_time: dto.endTime,
          description: descriptionPlain,
          serviceName: dto.serviceName.trim(),
          attendance: dto.attendance,
        },
        errorMessage: null,
        createdBy: actor.userId,
      });

      await this.prisma.portalTicketAppointment.update({
        where: { id: portalAppointment.id },
        data: { outboxId },
      });
    }

    const attachments = await this.saveAppointmentFiles(
      actor,
      ticketNumber,
      files,
      portalAppointment.id,
      outboxId,
      null,
    );

    const savedImages: SavedAppointmentImage[] = attachments
      .filter(
        (item): item is typeof item & { base64: string } =>
          Boolean(item.base64?.trim()),
      )
      .map((item) => ({
        fileId: item.fileId,
        mimeType: item.mimeType,
        base64: item.base64,
      }));

    if (savedImages.length > 0) {
      const enrichedDescription = enrichAppointmentDescriptionWithImages(
        descriptionRaw,
        savedImages,
      );
      if (enrichedDescription !== descriptionRaw) {
        await this.prisma.portalTicketAppointment.update({
          where: { id: portalAppointment.id },
          data: { description: enrichedDescription },
        });
      }
    }

    const attachmentNote =
      attachments.length > 0
        ? ` ${attachments.length} anexo(s) salvos.`
        : '';

    if (dto.projectActivityId?.trim()) {
      await this.projetos.linkPortalAppointmentToActivity({
        ticketNumber,
        projectActivityId: dto.projectActivityId.trim(),
        portalAppointmentId: portalAppointment.id,
        initTime: dto.initTime,
        endTime: dto.endTime,
        createdBy: actor.userId,
      });
    }

    return {
      ok: true,
      appointmentId: null,
      portalAppointmentId: portalAppointment.id,
      outboxId,
      attachmentsCount: attachments.length,
      tifluxSynced: false,
      portalOnly: !syncToTiflux,
      message: syncToTiflux
        ? `Apontamento salvo no portal (com tipo de atendimento). Sincronização com TiFlux em andamento — sem valorização.${attachmentNote}`
        : isTifluxAppointmentSyncEnabled()
          ? `Apontamento salvo no portal. Sincronização com TiFlux disponível apenas para tickets da mesa AlleOne.${attachmentNote}`
          : `Apontamento salvo no portal (sem envio ao TiFlux).${attachmentNote}`,
    };
  }
}
