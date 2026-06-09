import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import type {
  CreateDeskClassificationDto,
  CreateServiceDeskDto,
  UpdateDeskClassificationDto,
  UpdateServiceDeskDto,
} from './desk-classification.dto';

export type DeskClassificationNodeDto = {
  id: string;
  name: string;
  level: number;
  active: boolean;
  sortOrder: number;
  parentId: string | null;
  children: DeskClassificationNodeDto[];
};

@Injectable()
export class DeskClassificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
  ) {}

  async listDesks() {
    const desks = await this.usersService.listServiceDesks();
    return desks.map((desk) => ({
      ...desk,
      source: desk.externalId != null ? ('tiflux' as const) : ('portal' as const),
    }));
  }

  async createDesk(dto: CreateServiceDeskDto) {
    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException('Informe o nome da mesa.');
    }

    const duplicate = await this.prisma.serviceDesk.findFirst({
      where: { name, deletedAt: null },
      select: { id: true },
    });
    if (duplicate) {
      throw new BadRequestException('Já existe uma mesa com este nome.');
    }

    const desk = await this.prisma.serviceDesk.create({
      data: { name, active: true },
      select: { id: true, name: true, externalId: true },
    });

    return { ...desk, source: 'portal' as const };
  }

  async updateDesk(id: string, dto: UpdateServiceDeskDto) {
    const existing = await this.prisma.serviceDesk.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, name: true, externalId: true },
    });
    if (!existing) {
      throw new NotFoundException('Mesa de serviço não encontrada.');
    }

    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException('Informe o nome da mesa.');
    }

    const duplicate = await this.prisma.serviceDesk.findFirst({
      where: { name, deletedAt: null, id: { not: id } },
      select: { id: true },
    });
    if (duplicate) {
      throw new BadRequestException('Já existe uma mesa com este nome.');
    }

    const desk = await this.prisma.serviceDesk.update({
      where: { id },
      data: { name },
      select: { id: true, name: true, externalId: true },
    });

    return {
      ...desk,
      source: desk.externalId != null ? ('tiflux' as const) : ('portal' as const),
    };
  }

  async removeDesk(id: string) {
    const existing = await this.prisma.serviceDesk.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, externalId: true, name: true },
    });
    if (!existing) {
      throw new NotFoundException('Mesa de serviço não encontrada.');
    }

    const linkedUsers = await this.prisma.userServiceDesk.count({
      where: { serviceDeskId: id },
    });
    if (linkedUsers > 0) {
      throw new BadRequestException(
        'Esta mesa está vinculada a usuários. Remova o vínculo antes de excluir.',
      );
    }

    await this.prisma.serviceDesk.delete({ where: { id } });

    return { ok: true };
  }

  async getTree(serviceDeskId: string) {
    const desk = await this.prisma.serviceDesk.findFirst({
      where: { id: serviceDeskId, deletedAt: null },
      select: { id: true, name: true, externalId: true },
    });
    if (!desk) {
      throw new NotFoundException('Mesa de serviço não encontrada.');
    }

    const rows = await this.prisma.serviceDeskClassification.findMany({
      where: { serviceDeskId },
      orderBy: [{ level: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });

    const chain = this.buildChain(rows);

    return {
      desk,
      levelLabels: [
        { level: 1, label: 'Nível 1 — categoria' },
        { level: 2, label: 'Nível 2 — subcategoria' },
        { level: 3, label: 'Nível 3 — produto/solução' },
      ],
      chain,
      tree:
        chain.length > 0
          ? [
              chain.reduceRight<DeskClassificationNodeDto | null>(
                (child, node) => ({
                  ...node,
                  children: child ? [child] : [],
                }),
                null,
              )!,
            ]
          : [],
    };
  }

  async create(dto: CreateDeskClassificationDto) {
    const desk = await this.prisma.serviceDesk.findFirst({
      where: { id: dto.serviceDeskId, deletedAt: null, active: true },
      select: { id: true },
    });
    if (!desk) {
      throw new NotFoundException('Mesa de serviço não encontrada.');
    }

    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException('Informe o nome da classificação.');
    }

    let level = 1;
    let parentId: string | null = null;

    if (dto.parentId) {
      const parent = await this.prisma.serviceDeskClassification.findFirst({
        where: { id: dto.parentId, serviceDeskId: dto.serviceDeskId },
      });
      if (!parent) {
        throw new BadRequestException('Classificação pai não encontrada.');
      }
      if (parent.level >= 3) {
        throw new BadRequestException(
          'O nível máximo é 3 (produto/solução). Não é possível adicionar filhos.',
        );
      }
      level = parent.level + 1;
      parentId = parent.id;
    }

    const existingAtLevel =
      await this.prisma.serviceDeskClassification.findFirst({
        where: { serviceDeskId: dto.serviceDeskId, level },
        select: { id: true },
      });
    if (existingAtLevel) {
      throw new BadRequestException(
        `Já existe um item no nível ${level}. Edite ou exclua antes de adicionar outro.`,
      );
    }

    const created = await this.prisma.serviceDeskClassification.create({
      data: {
        serviceDeskId: dto.serviceDeskId,
        parentId,
        name,
        level,
      },
    });

    return created;
  }

  async update(id: string, dto: UpdateDeskClassificationDto) {
    const existing = await this.prisma.serviceDeskClassification.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Classificação não encontrada.');
    }

    const name = dto.name?.trim();
    if (dto.name !== undefined && !name) {
      throw new BadRequestException('Nome inválido.');
    }

    return this.prisma.serviceDeskClassification.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      },
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.serviceDeskClassification.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Classificação não encontrada.');
    }
    await this.prisma.serviceDeskClassification.delete({ where: { id } });
    return { ok: true };
  }

  private buildChain(
    rows: Array<{
      id: string;
      name: string;
      level: number;
      active: boolean;
      sortOrder: number;
      parentId: string | null;
    }>,
  ): DeskClassificationNodeDto[] {
    const level1 = rows.find((row) => row.level === 1 && row.parentId === null);
    if (!level1) return [];

    const level2 = rows.find(
      (row) => row.level === 2 && row.parentId === level1.id,
    );
    const level3 = level2
      ? rows.find((row) => row.level === 3 && row.parentId === level2.id)
      : undefined;

    const toNode = (row: (typeof rows)[number]): DeskClassificationNodeDto => ({
      id: row.id,
      name: row.name,
      level: row.level,
      active: row.active,
      sortOrder: row.sortOrder,
      parentId: row.parentId,
      children: [],
    });

    return [level1, level2, level3]
      .filter((row): row is (typeof rows)[number] => row != null)
      .map(toNode);
  }
}
