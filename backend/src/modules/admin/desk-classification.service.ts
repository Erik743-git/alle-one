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

const MAX_CLASSIFICATION_LEVEL = 3;

const SERVICE_CATALOG_LEVEL_LABELS = [
  { level: 1, label: 'Catálogo' },
  { level: 2, label: 'Área' },
  { level: 3, label: 'Serviço' },
];

const LEGACY_LEVEL_LABELS = [
  { level: 1, label: 'Categoria' },
  { level: 2, label: 'Subcategoria' },
];

@Injectable()
export class DeskClassificationService {
  constructor(private readonly prisma: PrismaService) {}

  async listDesks() {
    const desks = await this.prisma.specialty.findMany({
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
      throw new BadRequestException('Informe o nome da especialidade.');
    }

    const duplicate = await this.prisma.specialty.findFirst({
      where: { name, deletedAt: null },
      select: { id: true },
    });
    if (duplicate) {
      throw new BadRequestException(
        'Já existe uma especialidade com este nome.',
      );
    }

    const desk = await this.prisma.specialty.create({
      data: { name, active: true },
      select: { id: true, name: true, externalId: true },
    });

    return { ...desk, source: 'portal' as const };
  }

  async updateDesk(id: string, dto: UpdateServiceDeskDto) {
    const existing = await this.prisma.specialty.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, name: true, externalId: true },
    });
    if (!existing) {
      throw new NotFoundException('Especialidade não encontrada.');
    }

    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException('Informe o nome da especialidade.');
    }

    const duplicate = await this.prisma.specialty.findFirst({
      where: { name, deletedAt: null, id: { not: id } },
      select: { id: true },
    });
    if (duplicate) {
      throw new BadRequestException(
        'Já existe uma especialidade com este nome.',
      );
    }

    const desk = await this.prisma.specialty.update({
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
    const existing = await this.prisma.specialty.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, externalId: true, name: true },
    });
    if (!existing) {
      throw new NotFoundException('Especialidade não encontrada.');
    }

    // Os dois lados do vínculo: o campo legado `users.specialty_id` e a
    // tabela `user_specialties`. Conferir só o legado deixava passar a
    // exclusão de uma especialidade ligada apenas pela tabela — e, como o
    // vínculo é onDelete: Cascade, os registros sumiriam sem aviso.
    const linkedUsers = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        OR: [
          { specialtyId: id },
          { userSpecialties: { some: { specialtyId: id } } },
        ],
      },
      select: { name: true },
      orderBy: { name: 'asc' },
      take: 11,
    });
    if (linkedUsers.length > 0) {
      // Nomear quem trava a exclusão: sem isso o admin precisa abrir usuário
      // por usuário para descobrir onde está o vínculo.
      const nomes = linkedUsers.slice(0, 10).map((u) => u.name.trim());
      const resto = linkedUsers.length > 10 ? ' e outros' : '';
      throw new BadRequestException(
        `Esta especialidade está vinculada a ${nomes.join(', ')}${resto}. Remova o vínculo antes de excluir.`,
      );
    }

    await this.prisma.specialty.delete({ where: { id } });

    return { ok: true };
  }

  async getTree(specialtyId: string) {
    const desk = await this.prisma.specialty.findFirst({
      where: { id: specialtyId, deletedAt: null },
      select: { id: true, name: true, externalId: true },
    });
    if (!desk) {
      throw new NotFoundException('Especialidade não encontrada.');
    }

    const rows = await this.prisma.specialtyClassification.findMany({
      where: { specialtyId },
      orderBy: [{ level: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });

    const usesServiceCatalogTree =
      rows.some((row) => row.level >= 3) ||
      rows.some((row) => row.catalogNodeKind != null);
    const tree = this.buildTree(rows);

    return {
      desk: {
        ...desk,
        source: 'portal' as const,
      },
      specialty: {
        ...desk,
        source: 'portal' as const,
      },
      usesServiceCatalogTree,
      levelLabels: usesServiceCatalogTree
        ? SERVICE_CATALOG_LEVEL_LABELS
        : LEGACY_LEVEL_LABELS,
      tree,
    };
  }

  async create(dto: CreateDeskClassificationDto) {
    const specialtyId = dto.specialtyId || dto.serviceDeskId;
    if (!specialtyId) {
      throw new BadRequestException('Informe a especialidade.');
    }

    const desk = await this.prisma.specialty.findFirst({
      where: { id: specialtyId, deletedAt: null, active: true },
      select: { id: true },
    });
    if (!desk) {
      throw new NotFoundException('Especialidade não encontrada.');
    }

    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException('Informe o nome da classificação.');
    }

    let level = 1;
    let parentId: string | null = null;

    if (dto.parentId) {
      const parent = await this.prisma.specialtyClassification.findFirst({
        where: { id: dto.parentId, specialtyId },
      });
      if (!parent) {
        throw new BadRequestException('Classificação pai não encontrada.');
      }
      if (parent.level >= MAX_CLASSIFICATION_LEVEL) {
        throw new BadRequestException(
          'O nível máximo é 3 (serviço). Não é possível adicionar filhos.',
        );
      }
      level = parent.level + 1;
      parentId = parent.id;
    }

    const lastSibling = await this.prisma.specialtyClassification.findFirst({
      where: { specialtyId, parentId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    const sortOrder = (lastSibling?.sortOrder ?? -1) + 1;

    try {
      return await this.prisma.specialtyClassification.create({
        data: {
          specialtyId,
          parentId,
          name,
          level,
          sortOrder,
          catalogNodeKind:
            level === 1 ? 'catalog' : level === 2 ? 'area' : 'service',
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
    const existing = await this.prisma.specialtyClassification.findUnique({
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
      return await this.prisma.specialtyClassification.update({
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
    const existing = await this.prisma.specialtyClassification.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Classificação não encontrada.');
    }
    await this.prisma.specialtyClassification.delete({ where: { id } });
    return { ok: true };
  }

  async resolveClassificationId(classificationId?: string | null) {
    if (!classificationId) {
      return null;
    }

    const row = await this.prisma.specialtyClassification.findFirst({
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
      if (row.level > MAX_CLASSIFICATION_LEVEL) continue;
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
        row.level < MAX_CLASSIFICATION_LEVEL
          ? sortRows(byParent.get(row.id) ?? []).map(toNode)
          : [],
    });

    return sortRows(byParent.get(null) ?? []).map(toNode);
  }
}
