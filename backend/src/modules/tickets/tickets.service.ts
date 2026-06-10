import { createReadStream } from 'node:fs';
import { writeUploadedBuffer } from '../../common/upload/local-file.helper';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
  attachmentCount: number;
  attachments: Array<{
    id: string;
    fileId: string;
    originalName: string;
    mimeType: string;
    size: number;
  }>;
};

const ATTENDANCE_LABELS: Record<string, string> = {
  Remote: 'Remoto',
  External: 'Externo',
  Internal: 'Interno',
};

@Injectable()
export class TicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tiflux: TifluxService,
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

  private async listResponsibleUsersForTicketCreate(): Promise<
    Array<{ id: number; name: string; email: string | null }>
  > {
    const rows =
      (await this.prisma.$queryRaw<
        Array<{ external_id: number; name: string; email: string | null }>
      >`
        SELECT DISTINCT tu.external_id, tu.name, tu.email
        FROM users u
        INNER JOIN tiflux.users tu
          ON lower(trim(tu.email)) = lower(trim(u.email))
        WHERE u.responsible = true
          AND u.deleted_at IS NULL
          AND u.status = 'ACTIVE'
          AND COALESCE(tu.active, true) = true
        ORDER BY tu.name ASC
      `) ?? [];

    return rows.map((row) => ({
      id: Number(row.external_id),
      name: row.name,
      email: row.email,
    }));
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

  private async loadClassificationBundle(tifluxDeskId: number) {
    const portalDesk = await this.prisma.serviceDesk.findFirst({
      where: { externalId: tifluxDeskId, deletedAt: null, active: true },
      select: { id: true, name: true },
    });
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
  ) {
    const bundle = await this.loadClassificationBundle(tifluxDeskId);
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
    };
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
              t.is_closed
            FROM tiflux.tickets t
            WHERE COALESCE(t.is_closed, false) = false
              AND t.responsible_external_id = ${responsibleFilter}
              AND (${query.clientExternalId ?? null}::int IS NULL OR t.client_external_id = ${query.clientExternalId ?? null})
              AND (${query.stageName ?? null}::text IS NULL OR t.stage_name ILIKE ${query.stageName ? `%${query.stageName}%` : null})
              AND (${query.statusName ?? null}::text IS NULL OR t.status_name ILIKE ${query.statusName ? `%${query.statusName}%` : null})
              AND (${query.deskName ?? null}::text IS NULL OR t.desk_name ILIKE ${query.deskName ? `%${query.deskName}%` : null})
              AND (${fromDate}::timestamptz IS NULL OR t.created_at_source >= ${fromDate})
              AND (${toDate}::timestamptz IS NULL OR t.created_at_source <= ${toDate})
              AND (${ticketNumberFilter}::int IS NULL OR t.ticket_number = ${ticketNumberFilter})
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
              t.is_closed
            FROM tiflux.tickets t
            WHERE COALESCE(t.is_closed, false) = false
              AND (${responsibleFilter}::int IS NULL OR t.responsible_external_id = ${responsibleFilter})
              AND (${query.clientExternalId ?? null}::int IS NULL OR t.client_external_id = ${query.clientExternalId ?? null})
              AND (${query.stageName ?? null}::text IS NULL OR t.stage_name ILIKE ${query.stageName ? `%${query.stageName}%` : null})
              AND (${query.statusName ?? null}::text IS NULL OR t.status_name ILIKE ${query.statusName ? `%${query.statusName}%` : null})
              AND (${query.deskName ?? null}::text IS NULL OR t.desk_name ILIKE ${query.deskName ? `%${query.deskName}%` : null})
              AND (${fromDate}::timestamptz IS NULL OR t.created_at_source >= ${fromDate})
              AND (${toDate}::timestamptz IS NULL OR t.created_at_source <= ${toDate})
              AND (${ticketNumberFilter}::int IS NULL OR t.ticket_number = ${ticketNumberFilter})
              AND (
                ${search}::text = ''
                OR t.title ILIKE ${search ? `%${search}%` : ''}
                OR CAST(t.ticket_number AS text) ILIKE ${search ? `%${search}%` : ''}
              )
            ORDER BY t.updated_at_source DESC NULLS LAST, t.ticket_number DESC
            LIMIT ${limit}
          `) ?? []);

    const groupedMap = new Map<TicketStageGroupKey, TicketListItemDto[]>();
    for (const def of TICKET_STAGE_GROUPS) {
      groupedMap.set(def.key, []);
    }

    for (const row of rows) {
      const item = this.mapListItem(row);
      groupedMap.get(item.stageGroup)?.push(item);
    }

    const groups = TICKET_STAGE_GROUPS.map((def) => ({
      key: def.key,
      label: def.label,
      tickets: groupedMap.get(def.key) ?? [],
    })).filter((g) => g.tickets.length > 0);

    return {
      total: rows.length,
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
      throw new NotFoundException('Ticket não encontrado.');
    }

    const appointments = await this.listMergedAppointments(ticketNumber);

    const totalMinutes = appointments.reduce((sum, a) => sum + a.minutes, 0);
    const attendants = new Set(
      appointments.map((a) => a.userName).filter(Boolean),
    );

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
      summary: {
        attendantsCount: attendants.size,
        totalMinutes,
        totalHoursFormatted: `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`,
        appointmentsCount: appointments.length,
      },
      appointments,
    };
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

  private mapPortalAttachments(
    rows: Array<{
      id: string;
      fileId: string;
      file: {
        originalName: string;
        mimeType: string;
        size: number;
        deletedAt: Date | null;
      };
    }>,
  ) {
    return rows
      .filter((row) => !row.file.deletedAt)
      .map((row) => ({
        id: row.id,
        fileId: row.fileId,
        originalName: row.file.originalName,
        mimeType: row.file.mimeType,
        size: row.file.size,
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
      creator: { name: string };
      attachments: Array<{
        id: string;
        fileId: string;
        file: {
          originalName: string;
          mimeType: string;
          size: number;
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
        attachmentCount: portal?.attachments.length ?? 0,
        attachments: portal
          ? this.mapPortalAttachments(portal.attachments)
          : [],
      });
    }

    for (const portal of portalRows) {
      if (claimedPortalIds.has(portal.id)) continue;
      const mappedAttachments = this.mapPortalAttachments(portal.attachments);

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
            : 'PENDING_TIFLUX',
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
    return { id, name: name || `Item ${id}` };
  }

  async getCreateCatalogs(deskId?: number) {
    const [clientsRaw, desksRaw, responsibles] = await Promise.all([
      this.tiflux.getClientsAll({ active: true, maxPages: 30 }),
      this.tiflux.getDesksAll({ active: true, maxPages: 10 }),
      this.listResponsibleUsersForTicketCreate(),
    ]);

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
      const bundle = await this.loadClassificationBundle(deskId);
      portalServiceDesk = bundle.portalServiceDesk;
      classification = bundle.classification;

      const requiresCatalog = Boolean(desk.require_service_catalog_open_ticket);
      const hasPortalClassification =
        (classification?.tree?.length ?? 0) > 0;

      if (requiresCatalog && !hasPortalClassification) {
        const items = await this.tiflux.getDeskServicesCatalogItems(deskId);
        catalogItems = items.map((row) => this.mapCatalogItem(row));
      } else if (!requiresCatalog) {
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
        }>
      >`
        SELECT
          t.ticket_number,
          t.client_external_id,
          t.client_name,
          t.desk_external_id,
          t.desk_name
        FROM tiflux.tickets t
        WHERE t.ticket_number = ${ticketNumber}
        LIMIT 1
      `) ?? [];
    return rows[0] ?? null;
  }

  async getAppointmentCatalogs(ticketNumber: number) {
    const ticket = await this.getTicketContext(ticketNumber);
    if (!ticket) {
      throw new NotFoundException('Ticket não encontrado.');
    }

    const clientId = ticket.client_external_id;

    return {
      ticket: {
        ticketNumber: ticket.ticket_number,
        clientName: ticket.client_name,
        clientExternalId: clientId,
        deskName: ticket.desk_name,
        deskExternalId: ticket.desk_external_id,
        appointmentType: '',
      },
      serviceTypes: ['HORA NORMAL', 'HORA EXTRA', 'PLANTÃO'],
      attendances: [
        { value: 'Remote', label: 'Remoto' },
        { value: 'External', label: 'Externo' },
        { value: 'Internal', label: 'Interno' },
      ],
    };
  }

  private async saveAppointmentFiles(
    actor: AuthenticatedRequestUser,
    ticketNumber: number,
    files: Express.Multer.File[],
    portalAppointmentId: string,
    outboxId: string | null,
    tifluxAppointmentExternalId: number | null,
  ) {
    if (!files.length) return [];

    const uploadsDir = join(process.cwd(), 'uploads', 'tickets', String(ticketNumber));
    const saved: Array<{
      id: string;
      originalName: string;
      mimeType: string;
      size: number;
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
      const targetPath = join(uploadsDir, targetName);
      await writeUploadedBuffer(targetPath, file.buffer);

      const createdFile = await this.prisma.file.create({
        data: {
          originalName: file.originalname,
          mimeType: file.mimetype || 'application/octet-stream',
          path: targetPath,
          size: file.size,
          uploadedBy: actor.userId,
        },
      });

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

      saved.push({
        id: link.id,
        originalName: createdFile.originalName,
        mimeType: createdFile.mimeType,
        size: createdFile.size,
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

    return {
      stream: createReadStream(row.file.path),
      meta: {
        originalName: row.file.originalName,
        mimeType: row.file.mimeType,
        inline,
      },
    };
  }

  async createTicket(actor: AuthenticatedRequestUser, dto: CreateTicketDto) {
    const desk = await this.tiflux.getDesk(dto.deskId);
    const requiresCatalog = Boolean(desk.require_service_catalog_open_ticket);
    const classificationBundle = await this.loadClassificationBundle(dto.deskId);
    const hasPortalClassification =
      (classificationBundle.classification?.tree?.length ?? 0) > 0;

    await this.assertValidClassificationForDesk(
      dto.deskId,
      dto.classificationId,
    );

    if (requiresCatalog && !hasPortalClassification && !dto.servicesCatalogsItemId) {
      throw new BadRequestException(
        'Esta mesa exige um item do catálogo de serviços.',
      );
    }
    if (!requiresCatalog && !dto.priorityId) {
      throw new BadRequestException(
        'Esta mesa exige uma prioridade.',
      );
    }

    const allowedResponsibles = await this.listResponsibleUsersForTicketCreate();
    let responsibleId = dto.responsibleId ?? null;
    if (responsibleId == null) {
      const mine = await this.resolveTifluxExternalIdForUser(actor.email);
      const mineAllowed = mine
        ? allowedResponsibles.some((row) => row.id === mine.externalId)
        : false;
      responsibleId = mineAllowed ? mine?.externalId ?? null : null;
    } else if (!allowedResponsibles.some((row) => row.id === responsibleId)) {
      throw new BadRequestException(
        'O responsável deve ser um usuário marcado como responsável no cadastro.',
      );
    }

    let description = dto.description.trim();
    if (dto.classificationId) {
      const pathLabel = await this.resolveClassificationPathLabel(
        dto.classificationId,
      );
      if (pathLabel) {
        description = `Classificação: ${pathLabel}\n\n${description}`;
      }
    }

    const payload = {
      title: dto.title.trim(),
      description,
      client_id: dto.clientId,
      desk_id: dto.deskId,
      priority_id: dto.priorityId ?? undefined,
      services_catalogs_item_id: dto.servicesCatalogsItemId ?? undefined,
      responsible_id: responsibleId ?? undefined,
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

      return {
        ok: true,
        ticketNumber,
        message:
          'Ticket criado no TiFlux. Pode levar alguns minutos para aparecer na lista (sync).',
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

      if (error instanceof BadGatewayException) throw error;
      throw new BadGatewayException(message);
    }
  }

  private validateAppointmentDto(dto: CreateTicketAppointmentDto) {
    if (!dto.serviceName?.trim()) {
      throw new BadRequestException('Selecione o tipo de atendimento.');
    }
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

    const portalAppointment = await this.prisma.portalTicketAppointment.create({
      data: {
        ticketNumber,
        appointmentDate: new Date(`${dto.date}T12:00:00.000Z`),
        initTime: dto.initTime,
        endTime: dto.endTime,
        description: dto.description.trim(),
        serviceName: dto.serviceName.trim(),
        attendance: dto.attendance,
        syncStatus: PortalTicketAppointmentSyncStatus.PENDING_TIFLUX,
        createdBy: actor.userId,
      },
    });

    const outboxId = await this.recordOutbox({
      kind: PortalTifluxOutboxKind.CREATE_APPOINTMENT,
      status: PortalTifluxOutboxStatus.PENDING,
      ticketNumber,
      tifluxExternalId: null,
      payload: {
        portalAppointmentId: portalAppointment.id,
        date: dto.date,
        init_time: dto.initTime,
        end_time: dto.endTime,
        description: dto.description.trim(),
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

    const attachments = await this.saveAppointmentFiles(
      actor,
      ticketNumber,
      files,
      portalAppointment.id,
      outboxId,
      null,
    );

    const attachmentNote =
      attachments.length > 0
        ? ` ${attachments.length} anexo(s) salvos.`
        : '';

    return {
      ok: true,
      appointmentId: null,
      portalAppointmentId: portalAppointment.id,
      outboxId,
      attachmentsCount: attachments.length,
      tifluxSynced: false,
      portalOnly: false,
      message: `Apontamento salvo. Sincronização com TiFlux em andamento.${attachmentNote}`,
    };
  }
}
