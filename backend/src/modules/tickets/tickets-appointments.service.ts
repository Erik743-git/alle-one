import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import {
  PortalTicketAppointmentSyncStatus,
  PortalTifluxOutboxKind,
  PortalTifluxOutboxStatus,
} from '@prisma/client';
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
  isTicketsPortalCanonical,
  isTifluxRuntimeApiEnabled,
} from './tickets-portal.config';
import {
  appointmentDescriptionToPlainText,
  enrichAppointmentDescriptionWithImages,
  type SavedAppointmentImage,
} from './appointment-doc.util';
import { isTifluxAppointmentSyncEnabled } from './tiflux-appointment-sync.config';
import { isAlleOneTifluxDesk } from './tiflux-portal-desk.config';
import { hhmmIntervalsOverlap } from './portal-appointment.helper';
import type {
  CreateTicketAppointmentDto,
  UpdateTicketAppointmentDto,
} from './tickets-create.dto';

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
export class TicketsAppointmentsService {
  private get allowRuntimeTifluxApi(): boolean {
    return isTifluxRuntimeApiEnabled();
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly tiflux: TifluxService,
    private readonly fileStorage: FileStorageService,
    private readonly projetos: ProjetosService,
    private readonly tenantScope: TenantScopeService,
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
      select: { clientExternalId: true },
    });
    let clientExternalId = portalTicket?.clientExternalId ?? null;
    if (clientExternalId == null && actor.role === 'CLIENT') {
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
    await assertTicketClientScope(this.tenantScope, actor, clientExternalId);

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

  /**
   * Impede dois apontamentos do mesmo usuário no mesmo ticket com horários
   * sobrepostos (ou idênticos) no mesmo dia.
   */
  private async assertNoOverlappingAppointmentForUser(params: {
    userId: string;
    ticketNumber: number;
    date: string;
    initTime: string;
    endTime: string;
    excludeAppointmentId?: string;
  }) {
    const existing = await this.prisma.portalTicketAppointment.findMany({
      where: {
        createdBy: params.userId,
        ticketNumber: params.ticketNumber,
        appointmentDate: new Date(`${params.date}T12:00:00.000Z`),
        ...(params.excludeAppointmentId
          ? { id: { not: params.excludeAppointmentId } }
          : {}),
      },
      select: { id: true, initTime: true, endTime: true },
    });

    const conflict = existing.find((row) =>
      hhmmIntervalsOverlap(
        params.initTime,
        params.endTime,
        row.initTime,
        row.endTime,
      ),
    );
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

    await this.assertNoOverlappingAppointmentForUser({
      userId: actor.userId,
      ticketNumber,
      date: dto.date,
      initTime: dto.initTime,
      endTime: dto.endTime,
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
