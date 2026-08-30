import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { isClientPortalRole } from '../../common/security/client-portal-role';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedRequestUser } from '../auth/auth-request-user';
import {
  CreateTicketListPresetDto,
  TICKET_LIST_PRESET_COLORS,
  UpdateTicketListPresetDto,
} from './ticket-list-presets.dto';

const MAX_PINNED = 5;

export type TicketListPresetDto = {
  id: string;
  name: string;
  color: string;
  isPublic: boolean;
  isPinned: boolean;
  sortOrder: number;
  config: Prisma.JsonValue;
  isOwner: boolean;
  ownerName: string | null;
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class TicketListPresetsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actor: AuthenticatedRequestUser): Promise<TicketListPresetDto[]> {
    try {
      const companyId = actor.companyId ?? null;
      const rows = await this.prisma.ticketListPreset.findMany({
        where: {
          OR: [
            { userId: actor.userId },
            {
              isPublic: true,
              OR: [{ companyId: null }, ...(companyId ? [{ companyId }] : [])],
            },
          ],
        },
        include: {
          user: { select: { name: true } },
        },
        orderBy: [{ isPinned: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      });

      return rows.map((row) => this.toDto(row, actor.userId));
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2021' || error.code === 'P2022')
      ) {
        throw new InternalServerErrorException(
          'Filtros salvos ainda não estão disponíveis neste ambiente. Avise o suporte para aplicar as migrations do banco.',
        );
      }
      throw error;
    }
  }

  async create(
    actor: AuthenticatedRequestUser,
    dto: CreateTicketListPresetDto,
  ): Promise<TicketListPresetDto> {
    const isPublic = Boolean(dto.isPublic);
    if (isPublic && actor.role !== 'ADMIN') {
      throw new ForbiddenException(
        'Somente administradores podem tornar filtros públicos.',
      );
    }

    const color = this.normalizeColor(dto.color);
    const companyId = isClientPortalRole(actor.role)
      ? actor.companyId
      : (actor.companyId ?? null);

    if (dto.isPinned) {
      await this.assertPinCapacity(actor.userId, 0);
    }

    try {
      const row = await this.prisma.ticketListPreset.create({
        data: {
          userId: actor.userId,
          companyId,
          name: dto.name.trim(),
          color,
          isPublic,
          isPinned: Boolean(dto.isPinned),
          sortOrder: dto.isPinned
            ? await this.nextPinSortOrder(actor.userId)
            : 0,
          config: dto.config as Prisma.InputJsonValue,
        },
        include: { user: { select: { name: true } } },
      });
      return this.toDto(row, actor.userId);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BadRequestException('Já existe um filtro com este nome.');
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2021' || error.code === 'P2022')
      ) {
        throw new InternalServerErrorException(
          'Filtros salvos ainda não estão disponíveis neste ambiente. Avise o suporte para aplicar as migrations do banco.',
        );
      }
      throw error;
    }
  }

  async update(
    actor: AuthenticatedRequestUser,
    id: string,
    dto: UpdateTicketListPresetDto,
  ): Promise<TicketListPresetDto> {
    const existing = await this.getOwnedOrAdmin(actor, id);

    if (dto.isPublic === true && actor.role !== 'ADMIN') {
      throw new ForbiddenException(
        'Somente administradores podem tornar filtros públicos.',
      );
    }

    if (dto.isPinned === true && !existing.isPinned) {
      await this.assertPinCapacity(actor.userId, 0);
    }

    const row = await this.prisma.ticketListPreset.update({
      where: { id },
      data: {
        ...(dto.name != null ? { name: dto.name.trim() } : {}),
        ...(dto.color != null ? { color: this.normalizeColor(dto.color) } : {}),
        ...(dto.isPublic != null ? { isPublic: dto.isPublic } : {}),
        ...(dto.isPinned != null
          ? {
              isPinned: dto.isPinned,
              sortOrder: dto.isPinned
                ? (dto.sortOrder ??
                  (existing.isPinned
                    ? existing.sortOrder
                    : await this.nextPinSortOrder(actor.userId)))
                : 0,
            }
          : {}),
        ...(dto.sortOrder != null && dto.isPinned !== false
          ? { sortOrder: dto.sortOrder }
          : {}),
        ...(dto.config != null
          ? { config: dto.config as Prisma.InputJsonValue }
          : {}),
      },
      include: { user: { select: { name: true } } },
    });

    return this.toDto(row, actor.userId);
  }

  async remove(
    actor: AuthenticatedRequestUser,
    id: string,
  ): Promise<{ ok: true }> {
    await this.getOwnedOrAdmin(actor, id);
    await this.prisma.ticketListPreset.delete({ where: { id } });
    return { ok: true };
  }

  private async getOwnedOrAdmin(actor: AuthenticatedRequestUser, id: string) {
    const row = await this.prisma.ticketListPreset.findUnique({
      where: { id },
    });
    if (!row) throw new NotFoundException('Filtro não encontrado.');
    if (row.userId !== actor.userId && actor.role !== 'ADMIN') {
      throw new ForbiddenException('Sem permissão para alterar este filtro.');
    }
    return row;
  }

  private async assertPinCapacity(userId: string, extra: number) {
    const count = await this.prisma.ticketListPreset.count({
      where: { userId, isPinned: true },
    });
    if (count + extra > MAX_PINNED) {
      throw new BadRequestException(
        `É possível fixar no máximo ${MAX_PINNED} filtros na tela.`,
      );
    }
  }

  private async nextPinSortOrder(userId: string): Promise<number> {
    const last = await this.prisma.ticketListPreset.findFirst({
      where: { userId, isPinned: true },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    return (last?.sortOrder ?? -1) + 1;
  }

  private normalizeColor(raw?: string): string {
    const value = raw?.trim();
    if (value && TICKET_LIST_PRESET_COLORS.includes(value as never)) {
      return value;
    }
    if (value && /^#[0-9a-fA-F]{6}$/.test(value)) {
      return value;
    }
    return TICKET_LIST_PRESET_COLORS[1];
  }

  private toDto(
    row: {
      id: string;
      userId: string;
      name: string;
      color: string;
      isPublic: boolean;
      isPinned: boolean;
      sortOrder: number;
      config: Prisma.JsonValue;
      createdAt: Date;
      updatedAt: Date;
      user?: { name: string } | null;
    },
    actorUserId: string,
  ): TicketListPresetDto {
    return {
      id: row.id,
      name: row.name,
      color: row.color,
      isPublic: row.isPublic,
      isPinned: row.isPinned,
      sortOrder: row.sortOrder,
      config: row.config,
      isOwner: row.userId === actorUserId,
      ownerName: row.user?.name ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
