import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PortalTicketOrigin,
  PortalTifluxOutboxKind,
  PortalTifluxOutboxStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedRequestUser } from '../auth/auth-request-user';
export type {
  TicketHistoryDto,
  TicketListItemDto,
} from './tickets-query.service';
import { TifluxService } from '../tiflux/tiflux.service';
import type { CreateTicketDto, UpdateTicketDto } from './tickets-create.dto';
import {
  appointmentDescriptionToPlainText,
  enrichAppointmentDescriptionWithImages,
  type SavedAppointmentImage,
} from './appointment-doc.util';
import { TicketsAppointmentsService } from './tickets-appointments.service';
import { TicketsCatalogsService } from './tickets-catalogs.service';
import {
  isTicketsTifluxWriteEnabled,
} from './tickets-portal.config';
import { TicketsPortalStoreService } from './tickets-portal-store.service';

@Injectable()
export class TicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tiflux: TifluxService,
    private readonly catalogs: TicketsCatalogsService,
    private readonly appointments: TicketsAppointmentsService,
    private readonly portalStore: TicketsPortalStoreService,
  ) {}

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private async resolveTifluxExternalIdForUser(
    email: string,
  ): Promise<{ externalId: number; name: string | null } | null> {
    const normalized = this.normalizeEmail(email);
    try {
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
    } catch {
      return null;
    }
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

  async linkTicketGmud(
    actor: AuthenticatedRequestUser,
    ticketNumber: number,
    externalGmudRef: string | null | undefined,
  ) {
    const portal = await this.prisma.portalTicket.findUnique({
      where: { ticketNumber },
      select: { ticketNumber: true },
    });

    let found = Boolean(portal);
    if (!found) {
      try {
        const rows =
          (await this.prisma.$queryRaw<Array<{ ticket_number: number }>>`
            SELECT t.ticket_number
            FROM tiflux.tickets t
            WHERE t.ticket_number = ${ticketNumber}
            LIMIT 1
          `) ?? [];
        found = Boolean(rows[0]);
      } catch {
        found = false;
      }
    }

    if (!found) {
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

  getFilterCatalogs(actor: AuthenticatedRequestUser) {
    return this.catalogs.getFilterCatalogs(actor);
  }

  getCreateCatalogs(deskId?: number, clientId?: number) {
    return this.catalogs.getCreateCatalogs(deskId, clientId);
  }

  private async resolveDeskMetaForCreate(
    deskId: number,
    writeTiflux: boolean,
  ): Promise<{ name: string; requireServiceCatalog: boolean }> {
    if (writeTiflux) {
      const desk = await this.tiflux.getDesk(deskId);
      return {
        name: String(desk.display_name ?? desk.name ?? ''),
        requireServiceCatalog: Boolean(
          desk.require_service_catalog_open_ticket,
        ),
      };
    }

    const portalDesk = await this.prisma.serviceDesk.findFirst({
      where: { externalId: deskId, deletedAt: null, active: true },
      select: { name: true },
    });
    if (portalDesk) {
      return { name: portalDesk.name, requireServiceCatalog: false };
    }

    return { name: `Mesa ${deskId}`, requireServiceCatalog: false };
  }

  private async resolveClientName(clientId: number): Promise<string | null> {
    const company = await this.prisma.company.findFirst({
      where: { tifluxClientId: clientId, deletedAt: null },
      select: { name: true, tifluxClientName: true },
    });
    if (!company) return null;
    return company.tifluxClientName?.trim() || company.name || null;
  }

  async createTicket(
    actor: AuthenticatedRequestUser,
    dto: CreateTicketDto,
    files: Express.Multer.File[] = [],
  ) {
    const writeTiflux = isTicketsTifluxWriteEnabled();
    const deskMeta = await this.resolveDeskMetaForCreate(
      dto.deskId,
      writeTiflux,
    );
    const tifluxDeskName = deskMeta.name;
    const requiresCatalog = deskMeta.requireServiceCatalog;

    await this.catalogs.assertValidClassificationForDesk(
      dto.deskId,
      dto.classificationId,
      tifluxDeskName,
    );

    if (requiresCatalog && !dto.servicesCatalogsItemId) {
      throw new BadRequestException('Selecione o serviço do catálogo TiFlux.');
    }
    if (writeTiflux && !requiresCatalog && !dto.priorityId) {
      throw new BadRequestException('Esta mesa exige uma prioridade.');
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

    const allowedResponsibles = writeTiflux
      ? await this.catalogs.listTifluxResponsiblesForTicketCreate()
      : await this.catalogs.listResponsiblesFromMirror();

    let responsibleId = dto.responsibleId ?? null;
    if (responsibleId == null) {
      const mine = await this.resolveTifluxExternalIdForUser(actor.email);
      if (writeTiflux) {
        const mineAllowed = mine
          ? allowedResponsibles.some((row) => row.id === mine.externalId)
          : false;
        responsibleId = mineAllowed ? (mine?.externalId ?? null) : null;
      } else {
        responsibleId = mine?.externalId ?? null;
      }
    } else if (
      allowedResponsibles.length > 0 &&
      !allowedResponsibles.some((row) => row.id === responsibleId)
    ) {
      throw new BadRequestException(
        writeTiflux
          ? 'O responsável selecionado não é válido no TiFlux.'
          : 'O responsável selecionado não é válido.',
      );
    }

    let tifluxDescription = descriptionPlain;
    if (dto.classificationId) {
      const pathLabel = await this.catalogs.resolveClassificationPathLabel(
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

    const responsibleMeta = responsibleId
      ? allowedResponsibles.find((row) => row.id === responsibleId)
      : null;
    const clientName = await this.resolveClientName(dto.clientId);
    const mineForName =
      responsibleMeta?.name == null
        ? await this.resolveTifluxExternalIdForUser(actor.email)
        : null;
    const responsibleName =
      responsibleMeta?.name ??
      (responsibleId != null && mineForName?.externalId === responsibleId
        ? mineForName.name
        : null);

    try {
      let ticketNumber: number;
      let tifluxRaw: unknown = null;

      if (writeTiflux) {
        const raw = await this.tiflux.createTicket(payload);
        tifluxRaw = raw;
        ticketNumber = Number(
          (raw as { ticket?: { ticket_number?: number } })?.ticket
            ?.ticket_number,
        );
        if (!Number.isFinite(ticketNumber)) {
          throw new BadGatewayException(
            'TiFlux não retornou o número do ticket criado.',
          );
        }
        await this.appointments.recordOutbox({
          kind: PortalTifluxOutboxKind.CREATE_TICKET,
          status: PortalTifluxOutboxStatus.SYNCED,
          ticketNumber,
          tifluxExternalId: null,
          payload,
          errorMessage: null,
          createdBy: actor.userId,
        });
      } else {
        ticketNumber = await this.portalStore.allocatePortalTicketNumber();
      }

      await this.portalStore.upsertByTicketNumber({
        ticketNumber,
        title: dto.title.trim(),
        clientName,
        clientExternalId: dto.clientId,
        deskExternalId: dto.deskId,
        deskName: tifluxDeskName || null,
        responsibleExternalId: responsibleId,
        responsibleName,
        requestorName: dto.requestorName?.trim() || null,
        requestorEmail: dto.requestorEmail?.trim() || null,
        requestorTelephone: dto.requestorTelephone?.trim() || null,
        statusName: 'Aberto',
        stageName: 'Aberto',
        priorityName: null,
        createdByWayOf: writeTiflux ? 'TiFlux' : 'Portal',
        isClosed: false,
        origin: writeTiflux
          ? PortalTicketOrigin.TIFLUX
          : PortalTicketOrigin.PORTAL,
        createdAtSource: new Date(),
        updatedAtSource: new Date(),
        createdBy: actor.userId,
      });

      const externalGmudRef = this.normalizeExternalGmudRef(
        dto.externalGmudRef,
      );
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
        message: writeTiflux
          ? 'Ticket criado com sucesso.'
          : 'Ticket criado no portal (sem sync TiFlux).',
        tiflux: tifluxRaw,
        portalCanonical: true,
      };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Falha ao criar ticket no TiFlux.';

      if (writeTiflux) {
        await this.appointments.recordOutbox({
          kind: PortalTifluxOutboxKind.CREATE_TICKET,
          status: PortalTifluxOutboxStatus.FAILED,
          ticketNumber: null,
          tifluxExternalId: null,
          payload,
          errorMessage: message,
          createdBy: actor.userId,
        });
      }

      if (
        error instanceof BadGatewayException ||
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error instanceof BadGatewayException
          ? new BadRequestException(error.message)
          : error;
      }
      throw new BadGatewayException(message);
    }
  }

  async updateTicket(
    actor: AuthenticatedRequestUser,
    ticketNumber: number,
    dto: UpdateTicketDto,
    files: Express.Multer.File[] = [],
  ) {
    const portal = await this.prisma.portalTicket.findUnique({
      where: { ticketNumber },
    });

    let exists = Boolean(portal);
    if (!exists) {
      try {
        const rows =
          (await this.prisma.$queryRaw<Array<{ ticket_number: number }>>`
            SELECT t.ticket_number
            FROM tiflux.tickets t
            WHERE t.ticket_number = ${ticketNumber}
            LIMIT 1
          `) ?? [];
        exists = Boolean(rows[0]);
      } catch {
        exists = false;
      }
    }

    if (!exists) {
      throw new NotFoundException('Ticket não encontrado.');
    }

    if (portal?.isClosed && dto.isClosed !== false) {
      const touchingOpenFields =
        dto.title != null ||
        dto.description != null ||
        dto.responsibleId !== undefined ||
        dto.stageName != null ||
        dto.statusName != null;
      if (touchingOpenFields) {
        throw new BadRequestException(
          'Não é possível editar um ticket fechado. Reabra o ticket antes.',
        );
      }
    }

    const writeTiflux = isTicketsTifluxWriteEnabled();
    const title = dto.title?.trim();
    const stageName = dto.stageName?.trim();
    const statusName = dto.statusName?.trim();
    const descriptionRaw = dto.description?.trim();

    let responsibleId =
      dto.responsibleId === undefined ? undefined : dto.responsibleId;
    let responsibleName =
      dto.responsibleName === undefined
        ? undefined
        : dto.responsibleName?.trim() || null;

    if (responsibleId != null && !responsibleName) {
      const fromMirror = await this.catalogs.listResponsiblesFromMirror();
      responsibleName =
        fromMirror.find((r) => r.id === responsibleId)?.name ?? null;
    }

    if (writeTiflux && portal?.origin !== PortalTicketOrigin.PORTAL) {
      const payload: Record<string, unknown> = {};
      if (title) payload.title = title;
      if (descriptionRaw) {
        payload.description = appointmentDescriptionToPlainText(descriptionRaw);
      }
      if (responsibleId !== undefined) {
        payload.responsible_id = responsibleId;
      }
      if (Object.keys(payload).length > 0) {
        try {
          await this.tiflux.updateTicket(ticketNumber, payload);
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : 'Falha ao atualizar ticket no TiFlux.';
          throw new BadGatewayException(message);
        }
      }
    }

    await this.portalStore.upsertByTicketNumber({
      ticketNumber,
      title: title ?? portal?.title ?? null,
      clientName: portal?.clientName ?? null,
      clientExternalId: portal?.clientExternalId ?? null,
      deskName: portal?.deskName ?? null,
      deskExternalId: portal?.deskExternalId ?? null,
      requestorName: portal?.requestorName ?? null,
      requestorEmail: portal?.requestorEmail ?? null,
      requestorTelephone: portal?.requestorTelephone ?? null,
      priorityName: portal?.priorityName ?? null,
      createdByWayOf: portal?.createdByWayOf ?? null,
      statusName: statusName ?? portal?.statusName ?? null,
      stageName: stageName ?? portal?.stageName ?? null,
      responsibleExternalId:
        responsibleId !== undefined
          ? responsibleId
          : (portal?.responsibleExternalId ?? null),
      responsibleName:
        responsibleName !== undefined
          ? responsibleName
          : (portal?.responsibleName ?? null),
      isClosed:
        dto.isClosed !== undefined
          ? Boolean(dto.isClosed)
          : (portal?.isClosed ?? false),
      origin: portal?.origin,
      createdAtSource: portal?.createdAtSource ?? null,
      updatedAtSource: new Date(),
      createdBy: portal?.createdBy ?? actor.userId,
    });

    if (descriptionRaw) {
      await this.savePortalTicketDescription(
        actor,
        ticketNumber,
        descriptionRaw,
        files,
      );
    }

    const removeIds = (dto.removeAttachmentFileIds ?? [])
      .map((id) => id?.trim())
      .filter((id): id is string => Boolean(id));
    if (removeIds.length > 0) {
      await this.prisma.portalTicketAppointmentAttachment.deleteMany({
        where: {
          ticketNumber,
          portalAppointmentId: null,
          fileId: { in: removeIds },
        },
      });
    }

    if (stageName) {
      try {
        await this.prisma.$executeRawUnsafe(
          `
          UPDATE tiflux.tickets
          SET stage_name = $2::text
          WHERE ticket_number = $1
        `,
          ticketNumber,
          stageName,
        );
      } catch {
        // Mirror pode estar ausente no cutover local.
      }
    }

    return {
      ok: true,
      ticketNumber,
      message:
        writeTiflux && portal?.origin !== PortalTicketOrigin.PORTAL
          ? 'Ticket atualizado.'
          : 'Ticket atualizado no portal.',
    };
  }

  private async savePortalTicketDescription(
    actor: AuthenticatedRequestUser,
    ticketNumber: number,
    descriptionRaw: string,
    files: Express.Multer.File[],
  ) {
    const attachments = await this.appointments.saveAppointmentFiles(
      actor,
      ticketNumber,
      files,
      null,
      null,
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


}
