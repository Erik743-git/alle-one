import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import {
  PortalTicketAppointmentSyncStatus,
  PortalTifluxOutboxKind,
  PortalTifluxOutboxStatus,
} from '@prisma/client';
import { isClientPortalRole } from '../../common/security/client-portal-role';
import { FileStorageService } from '../../common/storage/file-storage.service';
import { TenantScopeService } from '../../common/security/tenant-scope.service';
import {
  assertAllowedUpload,
  TICKET_APPOINTMENT_UPLOAD_MAX_BYTES,
} from '../../common/upload.config';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedRequestUser } from '../auth/auth-request-user';
import { ProjetosService } from '../projetos/projetos.service';
import { TifluxService } from '../tiflux/tiflux.service';
import { assertTicketClientScope } from './tickets-client-scope';
import {
  getTicketAppointmentServiceTypes,
  isTicketsPortalCanonical,
  isTifluxRuntimeApiEnabled,
} from './tickets-portal.config';
import {
  appointmentDescriptionToEmailParts,
  appointmentDescriptionToPlainText,
  appointmentDocFileIds,
  enrichAppointmentDescriptionWithImages,
  hydrateAppointmentDescriptionImages,
  type SavedAppointmentImage,
} from './appointment-doc.util';
import { EmailTemplatesService } from '../mail/email-templates.service';
import type { SendMailAttachment } from '../mail/mail.service';
import {
  PORTAL_RESPONSIBLE_ID_BASE,
  portalResponsibleSyntheticId,
} from './portal-responsible.helper';
import { isTifluxAppointmentSyncEnabled } from './tiflux-appointment-sync.config';
import { isAlleOneTifluxDesk } from './tiflux-portal-desk.config';
import {
  addDaysYmd,
  appointmentDurationMinutes,
  daysBetweenYmd,
  hhmmDurationMinutes,
  isOvernightAppointment,
  parseHhMmToMinutes,
} from './portal-appointment.helper';
import type {
  CreateTicketAppointmentDto,
  UpdateTicketAppointmentDto,
} from './tickets-create.dto';
import {
  actorDisplayName,
  appointmentHistoryLabel,
  recordPortalTicketHistory,
} from './portal-ticket-history';
import { assertCanAppointmentOnNotStartedTicket } from './ticket-appointment-stage-guard';
import {
  assertCanManagePortalAppointment,
  canManagePortalAppointment,
} from './ticket-appointment-access';
import { isDonePortalStage } from './portal-ticket-stages';
import { resolveTicketStageGroup } from './tickets-stage-groups';

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

export type TicketAppointmentDto = {
  externalId: number | null;
  portalAppointmentId: string | null;
  appointmentDate: string | null;
  initTime: string | null;
  endTime: string | null;
  minutes: number;
  userName: string | null;
  createdByUserId: string | null;
  canManage: boolean;
  description: string | null;
  valorizationLabel: string | null;
  attendance: string | null;
  attendanceLabel: string | null;
  syncStatus: 'SYNCED' | 'PENDING_TIFLUX' | 'PORTAL_ONLY';
  syncPaused?: boolean;
  isWarning?: boolean;
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

export type TicketAppointmentWarningListItem = {
  portalAppointmentId: string;
  appointmentDate: string;
  initTime: string;
  endTime: string;
  userName: string;
  descriptionPreview: string;
};

export type TicketAppointmentWarningDetail = {
  portalAppointmentId: string;
  ticketNumber: number;
  ticketTitle: string;
  appointmentDate: string;
  initTime: string;
  endTime: string;
  userName: string;
  description: string;
  descriptionPlain: string;
  attachments: TicketAppointmentDto['attachments'];
};

const ATTENDANCE_LABELS: Record<string, string> = {
  Remote: 'Remoto',
  External: 'Externo',
  Internal: 'Interno',
};

@Injectable()
export class TicketsAppointmentsService {
  private readonly logger = new Logger(TicketsAppointmentsService.name);
  private static readonly EMAIL_ATTACHMENTS_MAX_BYTES = 18 * 1024 * 1024;

  private get allowRuntimeTifluxApi(): boolean {
    return isTifluxRuntimeApiEnabled();
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly tiflux: TifluxService,
    private readonly fileStorage: FileStorageService,
    private readonly projetos: ProjetosService,
    private readonly tenantScope: TenantScopeService,
    private readonly emailTemplates: EmailTemplatesService,
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
      const name =
        typeof candidate === 'string' || typeof candidate === 'number'
          ? String(candidate).trim()
          : '';
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
    if (end > start) return end - start;
    if (end === start) return 0;
    return end + 24 * 60 - start;
  }

  private appointmentMinutesFromStrings(
    initTime: string | null,
    endTime: string | null,
  ): number {
    return hhmmDurationMinutes(initTime, endTime);
  }

  private attendanceLabel(value: string | null | undefined): string | null {
    if (!value) return null;
    return ATTENDANCE_LABELS[value] ?? value;
  }

  async listAppointments(
    ticketNumber: number,
  ): Promise<TicketAppointmentDto[]> {
    try {
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
        createdByUserId: null,
        canManage: false,
        description: row.description,
        valorizationLabel: this.valorizationLabel(row.valorization_raw),
        attendance: null,
        attendanceLabel: null,
        syncStatus: 'SYNCED' as const,
        attachmentCount: 0,
        attachments: [],
      }));
    } catch {
      // Schema tiflux.* ausente no cutover local / ambiente portal-only.
      return [];
    }
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

  /** Exposto para reutilizar preview de anexos de pré-ticket no detalhe do chamado. */
  buildPreviewDataUrlPublic(
    previewDataBase64: string | null | undefined,
    file: { mimeType: string; path: string },
  ): string | null {
    return this.buildPreviewDataUrl(previewDataBase64, file);
  }

  async loadAttachmentPreviewMap(
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

  mapPortalAttachments(
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
    actor?: AuthenticatedRequestUser,
  ): Promise<TicketAppointmentDto[]> {
    // Cutover canônico: não mescla espelho tiflux.* (ETL já populou portal_*).
    const syncRows = isTicketsPortalCanonical()
      ? []
      : await this.listAppointments(ticketNumber);

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
      isWarning: boolean;
      createdBy: string;
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
      return syncRows.map((row) => ({
        ...row,
        createdByUserId: null,
        canManage: false,
      }));
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
      const access = this.appointmentAccessFields(
        actor,
        portal?.createdBy ?? null,
      );

      merged.push({
        externalId: sync.externalId,
        portalAppointmentId: portal?.id ?? null,
        appointmentDate: sync.appointmentDate,
        initTime: sync.initTime,
        endTime: sync.endTime,
        minutes: sync.minutes,
        userName: sync.userName,
        createdByUserId: access.createdByUserId,
        canManage: access.canManage,
        description: portal?.description?.trim() || sync.description,
        valorizationLabel: portal?.serviceName ?? sync.valorizationLabel,
        attendance: portal?.attendance ?? null,
        attendanceLabel: this.attendanceLabel(portal?.attendance),
        syncStatus: portal ? 'SYNCED' : 'SYNCED',
        syncPaused: false,
        attachmentCount: portal?.attachments.length ?? 0,
        isWarning: portal?.isWarning ?? false,
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
      const access = this.appointmentAccessFields(actor, portal.createdBy);

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
        createdByUserId: access.createdByUserId,
        canManage: access.canManage,
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
        isWarning: portal.isWarning,
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

  private appointmentAccessFields(
    actor: AuthenticatedRequestUser | undefined,
    createdBy: string | null | undefined,
  ): { createdByUserId: string | null; canManage: boolean } {
    const createdByUserId = createdBy ?? null;
    if (!actor || !createdByUserId) {
      return { createdByUserId, canManage: false };
    }
    return {
      createdByUserId,
      canManage: canManagePortalAppointment(actor, createdByUserId),
    };
  }

  private async assertCanAddAppointmentToTicket(
    ticket: NonNullable<Awaited<ReturnType<typeof this.getTicketContext>>>,
  ) {
    if (ticket.is_closed) {
      throw new BadRequestException(
        'Não é possível apontar em ticket fechado ou cancelado.',
      );
    }
    const portal = await this.prisma.portalTicket.findUnique({
      where: { ticketNumber: ticket.ticket_number },
      select: { isClosed: true, stageName: true },
    });
    if (portal?.isClosed) {
      throw new BadRequestException(
        'Não é possível apontar em ticket fechado ou cancelado.',
      );
    }
    if (isDonePortalStage(portal?.stageName ?? ticket.stage_name)) {
      throw new BadRequestException(
        'Não é possível apontar em ticket resolvido, encerrado ou cancelado.',
      );
    }
  }

  async recordOutbox(params: {
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
          params.status === PortalTifluxOutboxStatus.SYNCED ? new Date() : null,
      },
    });
    return row.id;
  }

  private async getTicketContext(ticketNumber: number) {
    const portal = await this.prisma.portalTicket.findUnique({
      where: { ticketNumber },
    });
    if (portal) {
      return {
        ticket_number: portal.ticketNumber,
        client_external_id: portal.clientExternalId,
        client_name: portal.clientName,
        desk_external_id: portal.deskExternalId,
        desk_name: portal.deskName,
        stage_name: portal.stageName,
        is_closed: portal.isClosed,
      };
    }

    try {
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
    } catch {
      // Schema tiflux.* pode estar ausente no cutover local.
    }

    if (!this.allowRuntimeTifluxApi) {
      return null;
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

  private async assertCanCreateAppointment(
    actor: AuthenticatedRequestUser,
    stageName: string | null | undefined,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: actor.userId },
      select: { specialty: { select: { name: true } } },
    });
    assertCanAppointmentOnNotStartedTicket({
      stageName,
      userSpecialtyName: user?.specialty?.name ?? null,
    });
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
        stageName: ticket.stage_name,
        stageGroup: resolveTicketStageGroup(ticket.stage_name),
        appointmentType: '',
        tifluxSyncAvailable,
      },
      projectLink: await this.projetos.listActivitiesForTicket(ticketNumber),
      serviceTypes: getTicketAppointmentServiceTypes(),
      attendances: [
        { value: 'Remote', label: 'Remoto' },
        { value: 'External', label: 'Externo' },
        { value: 'Internal', label: 'Interno' },
      ],
    };
  }

  async saveAppointmentFiles(
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
      assertAllowedUpload(file);
      if (file.size > TICKET_APPOINTMENT_UPLOAD_MAX_BYTES) {
        throw new BadRequestException(
          `Arquivo "${file.originalname}" excede o limite de 25MB.`,
        );
      }
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      const targetName = `${Date.now()}-${randomUUID()}-${safeName}`;
      const relativeKey = join('tickets', String(ticketNumber), targetName);
      const stored = await this.fileStorage.saveBuffer(
        relativeKey,
        file.buffer,
      );
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

  async downloadPortalAttachment(
    actor: AuthenticatedRequestUser,
    fileId: string,
    inline: boolean,
  ) {
    const row = await this.prisma.portalTicketAppointmentAttachment.findFirst({
      where: { fileId },
      include: { file: true },
    });
    if (!row?.file || row.file.deletedAt) {
      throw new NotFoundException('Anexo não encontrado.');
    }

    const portalTicket = await this.prisma.portalTicket.findUnique({
      where: { ticketNumber: row.ticketNumber },
      select: {
        clientExternalId: true,
        createdBy: true,
        requestorEmail: true,
      },
    });
    let clientExternalId = portalTicket?.clientExternalId ?? null;
    if (clientExternalId == null && isClientPortalRole(actor.role)) {
      try {
        const mirror =
          (await this.prisma.$queryRaw<
            Array<{ client_external_id: number | null }>
          >`
            SELECT t.client_external_id
            FROM tiflux.tickets t
            WHERE t.ticket_number = ${row.ticketNumber}
            LIMIT 1
          `) ?? [];
        clientExternalId = mirror[0]?.client_external_id ?? null;
      } catch {
        // Schema tiflux.* ausente.
      }
    }
    await assertTicketClientScope(this.tenantScope, actor, clientExternalId, {
      createdBy: portalTicket?.createdBy,
      requestorEmail: portalTicket?.requestorEmail,
    });

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

  private validateAppointmentDto(dto: CreateTicketAppointmentDto) {
    if (!dto.serviceName?.trim()) {
      throw new BadRequestException('Selecione o tipo de atendimento.');
    }
    const endDate = dto.endDate?.trim() || undefined;
    if (
      endDate &&
      endDate !== dto.date &&
      endDate !== addDaysYmd(dto.date, 1)
    ) {
      throw new BadRequestException(
        'O fim só pode ser no mesmo dia ou no dia seguinte.',
      );
    }
    const minutes = appointmentDurationMinutes({
      date: dto.date,
      initTime: dto.initTime,
      endTime: dto.endTime,
      endDate,
    });
    if (minutes <= 0) {
      const zeroDurationAlert =
        Boolean(dto.isWarning) &&
        dto.initTime === dto.endTime &&
        (!endDate || endDate === dto.date);
      if (!zeroDurationAlert) {
        throw new BadRequestException(
          'Horário final deve ser depois do horário inicial.',
        );
      }
    }
    if (minutes > 24 * 60) {
      throw new BadRequestException(
        'Apontamento não pode passar de 24 horas. Feche um e abra outro no dia seguinte.',
      );
    }
  }

  /**
   * Minutos absolutos a partir de `originYmd` 00:00, para comparar intervalos
   * que cruzam a meia-noite.
   */
  private absoluteMinutes(
    originYmd: string,
    dateYmd: string,
    initTime: string,
    endTime: string,
    endDate?: string | null,
  ): { start: number; end: number } | null {
    const startClock = parseHhMmToMinutes(initTime);
    const endClock = parseHhMmToMinutes(endTime);
    if (startClock == null || endClock == null) return null;
    const start = daysBetweenYmd(originYmd, dateYmd) * 24 * 60 + startClock;
    const overnight = isOvernightAppointment({
      date: dateYmd,
      initTime,
      endTime,
      endDate,
    });
    const endYmd = overnight
      ? endDate?.trim() && endDate.trim() !== dateYmd
        ? endDate.trim()
        : addDaysYmd(dateYmd, 1)
      : dateYmd;
    const end = daysBetweenYmd(originYmd, endYmd) * 24 * 60 + endClock;
    if (end <= start) return null;
    return { start, end };
  }

  /**
   * Impede dois apontamentos do mesmo usuário no mesmo ticket com horários
   * sobrepostos (ou idênticos), inclusive quando cruzam a meia-noite.
   */
  private async assertNoOverlappingAppointmentForUser(params: {
    userId: string;
    ticketNumber: number;
    date: string;
    initTime: string;
    endTime: string;
    endDate?: string | null;
    excludeAppointmentId?: string;
  }) {
    const overnight = isOvernightAppointment({
      date: params.date,
      initTime: params.initTime,
      endTime: params.endTime,
      endDate: params.endDate,
    });
    const dates = [
      addDaysYmd(params.date, -1),
      params.date,
      ...(overnight ? [addDaysYmd(params.date, 1)] : []),
    ];
    const existing = await this.prisma.portalTicketAppointment.findMany({
      where: {
        createdBy: params.userId,
        ticketNumber: params.ticketNumber,
        appointmentDate: {
          in: dates.map((day) => new Date(`${day}T12:00:00.000Z`)),
        },
        ...(params.excludeAppointmentId
          ? { id: { not: params.excludeAppointmentId } }
          : {}),
      },
      select: {
        id: true,
        appointmentDate: true,
        initTime: true,
        endTime: true,
      },
    });

    const origin = addDaysYmd(params.date, -1);
    const next = this.absoluteMinutes(
      origin,
      params.date,
      params.initTime,
      params.endTime,
      params.endDate,
    );
    if (!next) return;

    const conflict = existing.find((row) => {
      const date = this.formatDateOnly(row.appointmentDate) ?? params.date;
      const other = this.absoluteMinutes(
        origin,
        date,
        row.initTime,
        row.endTime,
      );
      if (!other) return false;
      return Math.max(next.start, other.start) < Math.min(next.end, other.end);
    });
    if (!conflict) return;

    throw new BadRequestException(
      `Já existe apontamento neste ticket no horário ${conflict.initTime}–${conflict.endTime}. ` +
        'Não é permitido registrar horários iguais ou sobrepostos.',
    );
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
      const appointments = await this.tiflux.getTicketAppointments(
        ticketNumber,
        {
          limit: 200,
        },
      );
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

    const attachmentRows =
      await this.prisma.portalTicketAppointmentAttachment.findMany({
        where: { portalAppointmentId: row.id },
        include: { file: true },
        orderBy: { createdAt: 'asc' },
      });
    const previewMap = await this.loadAttachmentPreviewMap(
      attachmentRows.map((item) => item.id),
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
      notifyClient: row.notifyClient,
      isWarning: row.isWarning,
      attachments: this.mapPortalAttachments(attachmentRows, previewMap),
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
    dto: UpdateTicketAppointmentDto,
    files: Express.Multer.File[] = [],
  ) {
    this.validateAppointmentDto(dto);

    const row = await this.getPortalAppointmentOrThrow(
      ticketNumber,
      portalAppointmentId,
    );
    assertCanManagePortalAppointment(actor, row.createdBy);
    const ticket = await this.getTicketContext(ticketNumber);
    if (!ticket) {
      throw new NotFoundException('Ticket não encontrado.');
    }

    await this.assertNoOverlappingAppointmentForUser({
      userId: row.createdBy,
      ticketNumber,
      date: dto.date,
      initTime: dto.initTime,
      endTime: dto.endTime,
      endDate: dto.endDate,
      excludeAppointmentId: row.id,
    });

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

    const removeIds = (dto.removeAttachmentFileIds ?? [])
      .map((id) => id?.trim())
      .filter((id): id is string => Boolean(id));
    if (removeIds.length > 0) {
      await this.prisma.portalTicketAppointmentAttachment.deleteMany({
        where: {
          portalAppointmentId: row.id,
          fileId: { in: removeIds },
        },
      });
    }

    const attachments = await this.saveAppointmentFiles(
      actor,
      ticketNumber,
      files,
      row.id,
      outboxId,
      row.tifluxAppointmentExternalId,
    );

    const savedImages: SavedAppointmentImage[] = attachments
      .filter((item): item is typeof item & { base64: string } =>
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

    await this.prisma.portalTicketAppointment.update({
      where: { id: row.id },
      data: {
        appointmentDate: new Date(`${dto.date}T12:00:00.000Z`),
        initTime: dto.initTime,
        endTime: dto.endTime,
        description,
        serviceName: dto.serviceName.trim(),
        attendance: dto.attendance,
        notifyClient: Boolean(dto.notifyClient),
        isWarning: Boolean(dto.isWarning),
        syncPausedAt: null,
        outboxId,
      },
    });

    await this.projetos.refreshPortalAppointmentLink(
      row.id,
      dto.initTime,
      dto.endTime,
    );

    const actorName = await actorDisplayName(this.prisma, actor);
    const beforeLabel = appointmentHistoryLabel({
      date: this.formatDateOnly(row.appointmentDate),
      initTime: row.initTime,
      endTime: row.endTime,
    });
    const afterLabel = appointmentHistoryLabel({
      date: dto.date,
      initTime: dto.initTime,
      endTime: dto.endTime,
    });
    const changes: string[] = [];
    if (beforeLabel !== afterLabel) {
      changes.push(`${beforeLabel} → ${afterLabel}`);
    }
    if (row.serviceName !== dto.serviceName.trim()) {
      changes.push(`tipo ${row.serviceName} → ${dto.serviceName.trim()}`);
    }
    if (row.description !== description) {
      changes.push('descrição');
    }
    if (removeIds.length > 0) {
      changes.push(`${removeIds.length} anexo(s) removido(s)`);
    }
    if (files.length > 0) {
      changes.push(`${files.length} anexo(s) adicionado(s)`);
    }
    if (row.isWarning !== Boolean(dto.isWarning)) {
      changes.push(dto.isWarning ? 'marcado como atenção' : 'atenção removida');
    }
    await recordPortalTicketHistory(this.prisma, {
      ticketNumber,
      eventType: 'APPOINTMENT_UPDATED',
      summary: changes.length
        ? `Apontamento alterado: ${changes.join(' · ')}`
        : `Apontamento alterado: ${afterLabel}`,
      actorName,
      externalKey: `appointment_updated:${row.id}:${Date.now()}`,
      payload: {
        portalAppointmentId: row.id,
        from: {
          date: this.formatDateOnly(row.appointmentDate),
          initTime: row.initTime,
          endTime: row.endTime,
          serviceName: row.serviceName,
        },
        to: {
          date: dto.date,
          initTime: dto.initTime,
          endTime: dto.endTime,
          serviceName: dto.serviceName.trim(),
        },
        notifyClient: Boolean(dto.notifyClient),
      },
    });

    const mailNote = await this.maybeSendClientCommunication({
      ticketNumber,
      portalAppointmentId: row.id,
      actor,
      actorName,
      date: dto.date,
      initTime: dto.initTime,
      endTime: dto.endTime,
      endDate: dto.endDate,
      description,
      notifyClient: Boolean(dto.notifyClient),
    });

    return {
      ok: true,
      message: `Apontamento atualizado.${mailNote}`,
    };
  }

  async deletePortalAppointment(
    actor: AuthenticatedRequestUser,
    ticketNumber: number,
    portalAppointmentId: string,
  ) {
    const row = await this.getPortalAppointmentOrThrow(
      ticketNumber,
      portalAppointmentId,
    );
    assertCanManagePortalAppointment(actor, row.createdBy);

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

    const actorName = await actorDisplayName(this.prisma, actor);
    const label = appointmentHistoryLabel({
      date: this.formatDateOnly(row.appointmentDate),
      initTime: row.initTime,
      endTime: row.endTime,
    });
    await recordPortalTicketHistory(this.prisma, {
      ticketNumber,
      eventType: 'APPOINTMENT_DELETED',
      summary: `Apontamento excluído: ${label}${
        row.serviceName ? ` (${row.serviceName})` : ''
      }`,
      actorName,
      externalKey: `appointment_deleted:${row.id}:${Date.now()}`,
      payload: {
        portalAppointmentId: row.id,
        date: this.formatDateOnly(row.appointmentDate),
        initTime: row.initTime,
        endTime: row.endTime,
        serviceName: row.serviceName,
      },
    });

    return {
      ok: true,
      message: 'Apontamento excluído.',
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

    await this.assertCanAddAppointmentToTicket(ticket);
    await this.assertCanCreateAppointment(actor, ticket.stage_name);

    this.validateAppointmentDto(dto);

    await this.assertNoOverlappingAppointmentForUser({
      userId: actor.userId,
      ticketNumber,
      date: dto.date,
      initTime: dto.initTime,
      endTime: dto.endTime,
      endDate: dto.endDate,
    });

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
        notifyClient: Boolean(dto.notifyClient),
        isWarning: Boolean(dto.isWarning),
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
      .filter((item): item is typeof item & { base64: string } =>
        Boolean(item.base64?.trim()),
      )
      .map((item) => ({
        fileId: item.fileId,
        mimeType: item.mimeType,
        base64: item.base64,
      }));

    let finalDescription = descriptionRaw;
    if (savedImages.length > 0) {
      const enrichedDescription = enrichAppointmentDescriptionWithImages(
        descriptionRaw,
        savedImages,
      );
      if (enrichedDescription !== descriptionRaw) {
        finalDescription = enrichedDescription;
        await this.prisma.portalTicketAppointment.update({
          where: { id: portalAppointment.id },
          data: { description: enrichedDescription },
        });
      }
    }

    const attachmentNote =
      attachments.length > 0 ? ` ${attachments.length} anexo(s) salvos.` : '';

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

    const actorName = await actorDisplayName(this.prisma, actor);
    const apptLabel = appointmentHistoryLabel({
      date: dto.date,
      initTime: dto.initTime,
      endTime: dto.endTime,
    });
    const serviceSuffix = dto.serviceName?.trim()
      ? ` (${dto.serviceName.trim()})`
      : '';
    await recordPortalTicketHistory(this.prisma, {
      ticketNumber,
      eventType: dto.isWarning
        ? 'APPOINTMENT_WARNING_CREATED'
        : 'APPOINTMENT_CREATED',
      summary: dto.isWarning
        ? `Atenção registrada: ${apptLabel}`
        : `Apontamento registrado: ${apptLabel}${serviceSuffix}`,
      actorName,
      externalKey: dto.isWarning
        ? `appointment_warning_created:${portalAppointment.id}`
        : `appointment_created:${portalAppointment.id}`,
      payload: {
        portalAppointmentId: portalAppointment.id,
        date: dto.date,
        initTime: dto.initTime,
        endTime: dto.endTime,
        serviceName: dto.serviceName.trim(),
        notifyClient: Boolean(dto.notifyClient),
        isWarning: Boolean(dto.isWarning),
      },
    });

    const mailNote = await this.maybeSendClientCommunication({
      ticketNumber,
      portalAppointmentId: portalAppointment.id,
      actor,
      actorName,
      date: dto.date,
      initTime: dto.initTime,
      endTime: dto.endTime,
      endDate: dto.endDate,
      description: finalDescription,
      notifyClient: Boolean(dto.notifyClient),
    });

    return {
      ok: true,
      appointmentId: null,
      portalAppointmentId: portalAppointment.id,
      outboxId,
      attachmentsCount: attachments.length,
      tifluxSynced: false,
      portalOnly: !syncToTiflux,
      message: `Apontamento salvo.${attachmentNote}${mailNote}`,
    };
  }

  private async maybeSendClientCommunication(params: {
    ticketNumber: number;
    portalAppointmentId: string;
    actor: AuthenticatedRequestUser;
    actorName: string;
    date: string;
    initTime: string;
    endTime: string;
    endDate?: string;
    description: string;
    notifyClient: boolean;
  }): Promise<string> {
    if (!params.notifyClient) return '';

    try {
      const sent = await this.sendClientCommunicationEmail(params);
      return sent
        ? ' E-mail enviado ao responsável e aos seguidores.'
        : ' Apontamento salvo, mas o e-mail de comunicação não foi enviado.';
    } catch (err) {
      this.logger.warn(
        `Falha na comunicação com cliente do apontamento ${params.portalAppointmentId}: ${
          err instanceof Error ? err.message : err
        }`,
      );
      return ' Apontamento salvo, mas o e-mail de comunicação não foi enviado.';
    }
  }

  private async sendClientCommunicationEmail(params: {
    ticketNumber: number;
    portalAppointmentId: string;
    actor: AuthenticatedRequestUser;
    actorName: string;
    date: string;
    initTime: string;
    endTime: string;
    endDate?: string;
    description: string;
  }): Promise<boolean> {
    const ticket = await this.prisma.portalTicket.findUnique({
      where: { ticketNumber: params.ticketNumber },
    });
    if (!ticket) {
      this.logger.warn(
        `APPOINTMENT_CLIENT_NOTIFY: ticket #${params.ticketNumber} não encontrado.`,
      );
      return false;
    }

    const [watchers, ticketDescriptionRow, responsibleEmail] =
      await Promise.all([
        this.prisma.portalTicketWatcher.findMany({
          where: { ticketNumber: params.ticketNumber },
          select: { email: true },
        }),
        this.prisma.portalTicketDescription.findUnique({
          where: { ticketNumber: params.ticketNumber },
          select: { description: true },
        }),
        this.resolveResponsibleEmail(
          ticket.responsibleExternalId,
          ticket.responsibleName,
        ),
      ]);

    const requestorEmail = ticket.requestorEmail?.trim() || null;
    const to: string[] = [];
    if (responsibleEmail) to.push(responsibleEmail);
    if (requestorEmail) to.push(requestorEmail);
    const cc = watchers.map((row) => row.email);

    const ticketDescRaw = ticketDescriptionRow?.description?.trim() || '';
    const imagesByFileId = await this.loadNotifyImagesByFileId([
      ...appointmentDocFileIds(params.description),
      ...appointmentDocFileIds(ticketDescRaw),
    ]);
    const appointmentDescription = hydrateAppointmentDescriptionImages(
      params.description,
      imagesByFileId,
    );
    const ticketDesc = hydrateAppointmentDescriptionImages(
      ticketDescRaw,
      imagesByFileId,
    );

    const appointmentParts = appointmentDescriptionToEmailParts(
      appointmentDescription,
    );
    const ticketParts = ticketDesc
      ? appointmentDescriptionToEmailParts(ticketDesc)
      : { html: '<p>—</p>', text: '—', inlineImages: [] };

    const skipFileIds = new Set([
      ...appointmentDocFileIds(appointmentDescription),
      ...appointmentDocFileIds(ticketDesc),
    ]);

    const fileAttachments = await this.collectNotifyFileAttachments(
      params.ticketNumber,
      params.portalAppointmentId,
      skipFileIds,
    );

    const mailAttachments: SendMailAttachment[] = [
      ...appointmentParts.inlineImages.map((img) => ({
        filename: img.filename,
        content: img.content,
        contentType: img.contentType,
        cid: img.cid,
      })),
      ...ticketParts.inlineImages.map((img) => ({
        filename: `chamado-${img.filename}`,
        content: img.content,
        contentType: img.contentType,
        cid: `ticket-${img.cid}`,
      })),
      ...fileAttachments,
    ];

    const ticketHtml = ticketParts.html.replace(
      /cid:(alleone-img-\d+@portal)/g,
      'cid:ticket-$1',
    );

    const extraCount = fileAttachments.length;
    const attachmentsNote =
      extraCount > 0 ||
      appointmentParts.inlineImages.length > 0 ||
      ticketParts.inlineImages.length > 0
        ? `<p><em>Imagens e anexos do apontamento e do chamado seguem neste e-mail.</em></p>`
        : '';

    const dateLabel = new Date(
      `${params.date}T12:00:00.000Z`,
    ).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
    const overnight = isOvernightAppointment({
      date: params.date,
      initTime: params.initTime,
      endTime: params.endTime,
      endDate: params.endDate,
    });
    const timeLabel = overnight
      ? `${params.initTime} – ${params.endTime} (dia seguinte)`
      : `${params.initTime} – ${params.endTime}`;

    return this.emailTemplates.sendAppointmentClientNotify({
      to,
      cc,
      ticketNumber: params.ticketNumber,
      ticketTitle: ticket.title?.trim() || 'Chamado',
      authorName: params.actorName.trim() || params.actor.email || 'equipe',
      appointmentDate: dateLabel,
      appointmentTime: timeLabel,
      appointmentDescriptionHtml: appointmentParts.html,
      appointmentDescriptionText: appointmentParts.text,
      ticketDescriptionHtml: ticketHtml,
      ticketDescriptionText: ticketParts.text,
      attachmentsNote,
      attachments: mailAttachments.length ? mailAttachments : undefined,
    });
  }

  private async resolveResponsibleEmail(
    responsibleExternalId: number | null,
    responsibleName: string | null,
  ): Promise<string | null> {
    const extId =
      responsibleExternalId != null && Number.isFinite(responsibleExternalId)
        ? Number(responsibleExternalId)
        : null;

    if (extId != null && extId < PORTAL_RESPONSIBLE_ID_BASE) {
      try {
        const rows =
          (await this.prisma.$queryRaw<Array<{ email: string | null }>>`
            SELECT tu.email
            FROM tiflux.users tu
            WHERE tu.external_id = ${extId}
              AND tu.email IS NOT NULL
              AND trim(tu.email) <> ''
            LIMIT 1
          `) ?? [];
        const email = rows[0]?.email?.trim();
        if (email) return email;
      } catch {
        this.logger.warn(
          'tiflux.users indisponível ao resolver e-mail do responsável.',
        );
      }
    }

    if (extId != null && extId >= PORTAL_RESPONSIBLE_ID_BASE) {
      const users = await this.prisma.user.findMany({
        where: { deletedAt: null, email: { not: '' } },
        select: { id: true, email: true },
        take: 800,
      });
      const match = users.find(
        (user) => portalResponsibleSyntheticId(user.id) === extId,
      );
      if (match?.email?.trim()) return match.email.trim();
    }

    const name = responsibleName?.trim();
    if (name) {
      const byName = await this.prisma.user.findFirst({
        where: { deletedAt: null, name },
        select: { email: true },
      });
      if (byName?.email?.trim()) return byName.email.trim();
    }

    return null;
  }

  private async collectNotifyFileAttachments(
    ticketNumber: number,
    portalAppointmentId: string,
    skipFileIds: Set<string>,
  ): Promise<SendMailAttachment[]> {
    const rows = await this.prisma.portalTicketAppointmentAttachment.findMany({
      where: {
        ticketNumber,
        OR: [{ portalAppointmentId }, { portalAppointmentId: null }],
      },
      include: { file: true },
      orderBy: { createdAt: 'asc' },
    });

    const attachments: SendMailAttachment[] = [];
    let totalBytes = 0;
    const seen = new Set<string>();

    for (const row of rows) {
      if (skipFileIds.has(row.fileId) || seen.has(row.fileId)) continue;
      seen.add(row.fileId);
      const size = row.file.size ?? 0;
      if (
        totalBytes + size >
        TicketsAppointmentsService.EMAIL_ATTACHMENTS_MAX_BYTES
      ) {
        this.logger.warn(
          `Anexo "${row.file.originalName}" omitido do e-mail (limite de tamanho).`,
        );
        continue;
      }
      try {
        const content = await this.fileStorage.readBuffer(row.file.path);
        attachments.push({
          filename: row.file.originalName || `anexo-${attachments.length + 1}`,
          content,
          contentType: row.file.mimeType || 'application/octet-stream',
        });
        totalBytes += content.length;
      } catch (err) {
        this.logger.warn(
          `Não foi possível ler anexo ${row.fileId} para o e-mail: ${
            err instanceof Error ? err.message : err
          }`,
        );
      }
    }

    return attachments;
  }

  private async loadNotifyImagesByFileId(
    fileIds: string[],
  ): Promise<Record<string, SavedAppointmentImage>> {
    const uniqueIds = [...new Set(fileIds.filter(Boolean))];
    if (!uniqueIds.length) return {};

    const files = await this.prisma.file.findMany({
      where: { id: { in: uniqueIds } },
    });
    const map: Record<string, SavedAppointmentImage> = {};
    for (const file of files) {
      if (!file.mimeType?.startsWith('image/')) continue;
      try {
        const buffer = await this.fileStorage.readBuffer(file.path);
        if (!buffer.length) continue;
        map[file.id] = {
          fileId: file.id,
          mimeType: file.mimeType,
          base64: buffer.toString('base64'),
        };
      } catch (err) {
        this.logger.warn(
          `Não foi possível ler imagem ${file.id} para o e-mail: ${
            err instanceof Error ? err.message : err
          }`,
        );
      }
    }
    return map;
  }

  private async getPortalTicketTitle(ticketNumber: number): Promise<string> {
    const portal = await this.prisma.portalTicket.findUnique({
      where: { ticketNumber },
      select: { title: true },
    });
    const title = portal?.title?.trim();
    return title || `Ticket #${ticketNumber}`;
  }

  private warningDescriptionPreview(description: string, max = 120): string {
    const plain = appointmentDescriptionToPlainText(description)
      .replace(/\s+/g, ' ')
      .trim();
    if (plain.length <= max) return plain;
    return `${plain.slice(0, max)}…`;
  }

  async listPendingAppointmentWarnings(
    actor: AuthenticatedRequestUser,
    ticketNumber: number,
  ): Promise<{
    ticketTitle: string;
    warnings: TicketAppointmentWarningListItem[];
  }> {
    const ticket = await this.getTicketContext(ticketNumber);
    if (!ticket) {
      throw new NotFoundException('Ticket não encontrado.');
    }

    const [ticketTitle, rows] = await Promise.all([
      this.getPortalTicketTitle(ticketNumber),
      this.prisma.portalTicketAppointment.findMany({
        where: {
          ticketNumber,
          isWarning: true,
          createdBy: { not: actor.userId },
          warningAcks: { none: { userId: actor.userId } },
        },
        include: { creator: { select: { name: true } } },
        orderBy: [{ appointmentDate: 'desc' }, { initTime: 'desc' }],
      }),
    ]);

    return {
      ticketTitle,
      warnings: rows.map((row) => ({
        portalAppointmentId: row.id,
        appointmentDate: this.formatDateOnly(row.appointmentDate) ?? '',
        initTime: row.initTime,
        endTime: row.endTime,
        userName: row.creator.name,
        descriptionPreview: this.warningDescriptionPreview(row.description),
      })),
    };
  }

  async getAppointmentWarningDetail(
    actor: AuthenticatedRequestUser,
    ticketNumber: number,
    portalAppointmentId: string,
  ): Promise<TicketAppointmentWarningDetail> {
    const row = await this.prisma.portalTicketAppointment.findFirst({
      where: {
        id: portalAppointmentId,
        ticketNumber,
        isWarning: true,
      },
      include: {
        creator: { select: { name: true } },
        attachments: { include: { file: true }, orderBy: { createdAt: 'asc' } },
      },
    });
    if (!row) {
      throw new NotFoundException('Atenção não encontrada.');
    }
    if (row.createdBy === actor.userId) {
      throw new BadRequestException(
        'O autor da atenção não precisa confirmar a própria leitura.',
      );
    }

    const previewMap = await this.loadAttachmentPreviewMap(
      row.attachments.map((item) => item.id),
    );
    const ticketTitle = await this.getPortalTicketTitle(ticketNumber);

    return {
      portalAppointmentId: row.id,
      ticketNumber: row.ticketNumber,
      ticketTitle,
      appointmentDate: this.formatDateOnly(row.appointmentDate) ?? '',
      initTime: row.initTime,
      endTime: row.endTime,
      userName: row.creator.name,
      description: row.description,
      descriptionPlain: appointmentDescriptionToPlainText(row.description),
      attachments: this.mapPortalAttachments(row.attachments, previewMap),
    };
  }

  async acknowledgeAppointmentWarning(
    actor: AuthenticatedRequestUser,
    ticketNumber: number,
    portalAppointmentId: string,
    permanent: boolean,
  ) {
    const row = await this.prisma.portalTicketAppointment.findFirst({
      where: {
        id: portalAppointmentId,
        ticketNumber,
        isWarning: true,
      },
    });
    if (!row) {
      throw new NotFoundException('Atenção não encontrada.');
    }
    if (row.createdBy === actor.userId) {
      return { ok: true, message: 'Autor da atenção.' };
    }

    if (!permanent) {
      return {
        ok: true,
        message: 'Leitura registrada nesta sessão.',
        permanent: false,
      };
    }

    await this.prisma.portalTicketAppointmentWarningAck.upsert({
      where: {
        portalAppointmentId_userId: {
          portalAppointmentId,
          userId: actor.userId,
        },
      },
      create: {
        portalAppointmentId,
        userId: actor.userId,
      },
      update: {
        acknowledgedAt: new Date(),
      },
    });

    const actorName = await actorDisplayName(this.prisma, actor);
    const apptLabel = appointmentHistoryLabel({
      date: this.formatDateOnly(row.appointmentDate),
      initTime: row.initTime,
      endTime: row.endTime,
    });
    await recordPortalTicketHistory(this.prisma, {
      ticketNumber,
      eventType: 'APPOINTMENT_WARNING_ACKNOWLEDGED',
      summary: `${actorName} confirmou leitura da atenção (${apptLabel}) e marcou para não exibir novamente`,
      actorName,
      externalKey: `appointment_warning_ack:${portalAppointmentId}:${actor.userId}`,
      payload: {
        portalAppointmentId,
        userId: actor.userId,
        permanent: true,
      },
    });

    return {
      ok: true,
      message: 'Atenção marcada como lida.',
      permanent: true,
    };
  }
}
