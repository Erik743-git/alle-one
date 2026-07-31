import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  CreateTicketStageDto,
  UpdateTicketStageDto,
} from './ticket-stage.dto';

export type TicketStageDto = {
  id: string;
  name: string;
  isSystem: boolean;
  syncsToTiflux: boolean;
  active: boolean;
  sortOrder: number;
};

@Injectable()
export class TicketStageService {
  constructor(private readonly prisma: PrismaService) {}

  private map(row: {
    id: string;
    name: string;
    isSystem: boolean;
    syncsToTiflux: boolean;
    active: boolean;
    sortOrder: number;
  }): TicketStageDto {
    return {
      id: row.id,
      name: row.name,
      isSystem: row.isSystem,
      syncsToTiflux: row.syncsToTiflux,
      active: row.active,
      sortOrder: row.sortOrder,
    };
  }

  private async assertNameAvailable(name: string, ignoreId?: string) {
    const duplicate = await this.prisma.ticketStage.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        deletedAt: null,
        ...(ignoreId ? { id: { not: ignoreId } } : {}),
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new BadRequestException('Já existe um estágio com este nome.');
    }
  }

  async list(): Promise<TicketStageDto[]> {
    const rows = await this.prisma.ticketStage.findMany({
      where: { deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return rows.map((row) => this.map(row));
  }

  async create(dto: CreateTicketStageDto): Promise<TicketStageDto> {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Informe o nome do estágio.');
    await this.assertNameAvailable(name);

    const maxOrder = await this.prisma.ticketStage.aggregate({
      where: { deletedAt: null },
      _max: { sortOrder: true },
    });

    const created = await this.prisma.ticketStage.create({
      data: {
        name,
        isSystem: false,
        syncsToTiflux: dto.syncsToTiflux ?? false,
        active: true,
        sortOrder: dto.sortOrder ?? (maxOrder._max.sortOrder ?? 0) + 1,
      },
    });
    return this.map(created);
  }

  async update(id: string, dto: UpdateTicketStageDto): Promise<TicketStageDto> {
    const existing = await this.prisma.ticketStage.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Estágio não encontrado.');
    if (existing.isSystem) {
      throw new ForbiddenException('Estágios padrão não podem ser alterados.');
    }

    const name = dto.name?.trim();
    if (name !== undefined) {
      if (!name) throw new BadRequestException('Informe o nome do estágio.');
      await this.assertNameAvailable(name, id);
    }

    const updated = await this.prisma.ticketStage.update({
      where: { id },
      data: {
        name: name ?? undefined,
        syncsToTiflux:
          dto.syncsToTiflux !== undefined ? dto.syncsToTiflux : undefined,
        active: dto.active !== undefined ? dto.active : undefined,
        sortOrder: dto.sortOrder !== undefined ? dto.sortOrder : undefined,
      },
    });
    return this.map(updated);
  }

  async remove(id: string): Promise<{ ok: true }> {
    const existing = await this.prisma.ticketStage.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Estágio não encontrado.');
    if (existing.isSystem) {
      throw new ForbiddenException('Estágios padrão não podem ser removidos.');
    }

    await this.prisma.ticketStage.update({
      where: { id },
      data: { deletedAt: new Date(), active: false },
    });
    return { ok: true };
  }
}
