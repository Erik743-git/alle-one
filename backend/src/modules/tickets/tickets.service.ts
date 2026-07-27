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
import type { CreateTicketDto } from './tickets-create.dto';
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

  getFilterCatalogs(actor: AuthenticatedRequestUser) {
    return this.catalogs.getFilterCatalogs(actor);
  }

  getCreateCatalogs(deskId?: number, clientId?: number) {
    return this.catalogs.getCreateCatalogs(deskId, clientId);
  }

  async createTicket(
    actor: AuthenticatedRequestUser,
    dto: CreateTicketDto,
    files: Express.Multer.File[] = [],
  ) {
    const desk = await this.tiflux.getDesk(dto.deskId);
    const tifluxDeskName = String(desk.display_name ?? desk.name ?? '');
    const requiresCatalog = Boolean(desk.require_service_catalog_open_ticket);

    await this.catalogs.assertValidClassificationForDesk(
      dto.deskId,
      dto.classificationId,
      tifluxDeskName,
    );

    if (requiresCatalog && !dto.servicesCatalogsItemId) {
      throw new BadRequestException('Selecione o serviço do catálogo TiFlux.');
    }
    if (!requiresCatalog && !dto.priorityId) {
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

    const allowedResponsibles =
      await this.catalogs.listTifluxResponsiblesForTicketCreate();
    let responsibleId = dto.responsibleId ?? null;
    if (responsibleId == null) {
      const mine = await this.resolveTifluxExternalIdForUser(actor.email);
      const mineAllowed = mine
        ? allowedResponsibles.some((row) => row.id === mine.externalId)
        : false;
      responsibleId = mineAllowed ? (mine?.externalId ?? null) : null;
    } else if (!allowedResponsibles.some((row) => row.id === responsibleId)) {
      throw new BadRequestException(
        'O responsável selecionado não é válido no TiFlux.',
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

    const writeTiflux = isTicketsTifluxWriteEnabled();
    const responsibleMeta = responsibleId
      ? allowedResponsibles.find((row) => row.id === responsibleId)
      : null;

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
        clientExternalId: dto.clientId,
        deskExternalId: dto.deskId,
        deskName: tifluxDeskName || null,
        responsibleExternalId: responsibleId,
        responsibleName: responsibleMeta?.name ?? null,
        requestorName: dto.requestorName?.trim() || null,
        requestorEmail: dto.requestorEmail?.trim() || null,
        requestorTelephone: dto.requestorTelephone?.trim() || null,
        statusName: 'Aberto',
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
