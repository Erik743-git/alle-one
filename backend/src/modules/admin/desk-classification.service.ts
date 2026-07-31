import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
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

type ClassificationRow = {
  id: string;
  name: string;
  level: number;
  active: boolean;
  sortOrder: number;
  parentId: string | null;
};

@Injectable()
export class DeskClassificationService {
  constructor(private readonly prisma: PrismaService) {}

  async listDesks() {
    const desks = await this.prisma.serviceDesk.findMany({
      where: { deletedAt: null, active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, externalId: true },
    });
    return desks.map((desk) => ({
      ...desk,
      source: 'portal' as const,
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
      source: 'portal' as const,
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

    const tree = this.buildTree(rows);

    return {
      desk: {
        ...desk,
        source: 'portal' as const,
      },
      levelLabels: [
        { level: 1, label: 'Nível 1 — categoria' },
        { level: 2, label: 'Nível 2 — subcategoria' },
        { level: 3, label: 'Nível 3 — produto/solução' },
      ],
      tree,
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

    const lastSibling = await this.prisma.serviceDeskClassification.findFirst({
      where: { serviceDeskId: dto.serviceDeskId, parentId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    const sortOrder = (lastSibling?.sortOrder ?? -1) + 1;

    try {
      return await this.prisma.serviceDeskClassification.create({
        data: {
          serviceDeskId: dto.serviceDeskId,
          parentId,
          name,
          level,
          sortOrder,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BadRequestException(
          'Já existe uma classificação com este nome neste nível.',
        );
      }
      throw error;
    }
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

    try {
      return await this.prisma.serviceDeskClassification.update({
        where: { id },
        data: {
          ...(name !== undefined ? { name } : {}),
          ...(dto.active !== undefined ? { active: dto.active } : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BadRequestException(
          'Já existe uma classificação com este nome neste nível.',
        );
      }
      throw error;
    }
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

  async resolveClassificationId(classificationId?: string | null) {
    if (!classificationId) {
      return null;
    }

    const row = await this.prisma.serviceDeskClassification.findFirst({
      where: { id: classificationId, active: true },
      select: { id: true },
    });
    if (!row) {
      throw new BadRequestException('Classificação inválida ou inativa.');
    }
    return row.id;
  }

  private buildTree(rows: ClassificationRow[]): DeskClassificationNodeDto[] {
    const byParent = new Map<string | null, ClassificationRow[]>();
    for (const row of rows) {
      const key = row.parentId;
      const bucket = byParent.get(key);
      if (bucket) {
        bucket.push(row);
      } else {
        byParent.set(key, [row]);
      }
    }

    const sortRows = (list: ClassificationRow[]) =>
      [...list].sort(
        (a, b) =>
          a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'pt-BR'),
      );

    const toNode = (row: ClassificationRow): DeskClassificationNodeDto => ({
      id: row.id,
      name: row.name,
      level: row.level,
      active: row.active,
      sortOrder: row.sortOrder,
      parentId: row.parentId,
      children:
        row.level < 3 ? sortRows(byParent.get(row.id) ?? []).map(toNode) : [],
    });

    return sortRows(byParent.get(null) ?? []).map(toNode);
  }
}
