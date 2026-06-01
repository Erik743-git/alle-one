import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { createReadStream, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { StreamableFile } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedRequestUser } from '../auth/auth-request-user';
import type {
  CreateInventoryAssetDto,
  UpdateInventoryAssetDto,
} from './inventario.dto';

export type InventoryAssetDto = {
  id: string;
  companyId: string;
  name: string;
  unit: string | null;
  dueDate: string | null;
  notes: string | null;
  file: {
    id: string;
    originalName: string;
    mimeType: string;
    size: number;
  } | null;
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class InventarioService {
  constructor(private readonly prisma: PrismaService) {}

  private async getAccessibleCompanyIds(
    user: AuthenticatedRequestUser,
  ): Promise<string[]> {
    if (user.role === UserRole.CLIENT) {
      if (!user.companyId) {
        throw new ForbiddenException('Usuário sem empresa vinculada.');
      }
      return [user.companyId];
    }

    const companies = await this.prisma.company.findMany({
      where: { deletedAt: null },
      select: { id: true },
    });
    return companies.map((c) => c.id);
  }

  private ensureCompanyInScope(companyId: string, scope: string[]) {
    if (!scope.includes(companyId)) {
      throw new ForbiddenException('Sem acesso à empresa informada.');
    }
  }

  private mapAsset(row: {
    id: string;
    companyId: string;
    name: string;
    unit: string | null;
    dueDate: Date | null;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
    file: {
      id: string;
      originalName: string;
      mimeType: string;
      size: number;
    } | null;
  }): InventoryAssetDto {
    return {
      id: row.id,
      companyId: row.companyId,
      name: row.name,
      unit: row.unit,
      dueDate: row.dueDate
        ? row.dueDate.toISOString().slice(0, 10)
        : null,
      notes: row.notes,
      file: row.file,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private assetInclude() {
    return {
      file: {
        select: {
          id: true,
          originalName: true,
          mimeType: true,
          size: true,
          deletedAt: true,
        },
      },
    } as const;
  }

  private parseDueDate(value?: string | null): Date | null | undefined {
    if (value === undefined) return undefined;
    const trimmed = String(value ?? '').trim();
    if (!trimmed) return null;
    const parsed = new Date(`${trimmed.slice(0, 10)}T12:00:00`);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('Data de vencimento inválida.');
    }
    return parsed;
  }

  private async saveUploadedFile(
    user: AuthenticatedRequestUser,
    file: Express.Multer.File,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Arquivo inválido.');
    }

    const uploadsDir = join(process.cwd(), 'uploads', 'inventory');
    mkdirSync(uploadsDir, { recursive: true });
    const safeName = file.originalname.replace(/[^\w.\-() ]+/g, '_');
    const targetName = `${Date.now()}-${randomUUID()}-${safeName}`;
    const targetPath = join(uploadsDir, targetName);
    writeFileSync(targetPath, file.buffer);

    return this.prisma.file.create({
      data: {
        originalName: file.originalname,
        mimeType: file.mimetype || 'application/octet-stream',
        path: targetPath,
        size: file.size,
        uploadedBy: user.userId,
      },
    });
  }

  async listCompanies(user: AuthenticatedRequestUser) {
    const scope = await this.getAccessibleCompanyIds(user);
    const companies = await this.prisma.company.findMany({
      where: { id: { in: scope }, deletedAt: null },
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            inventoryAssets: { where: { deletedAt: null } },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    return companies.map((c) => ({
      id: c.id,
      name: c.name,
      assetsCount: c._count.inventoryAssets,
    }));
  }

  async listAssets(user: AuthenticatedRequestUser, companyId: string) {
    const scope = await this.getAccessibleCompanyIds(user);
    this.ensureCompanyInScope(companyId, scope);

    const company = await this.prisma.company.findFirst({
      where: { id: companyId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!company) throw new NotFoundException('Empresa não encontrada.');

    const rows = await this.prisma.inventoryAsset.findMany({
      where: { companyId, deletedAt: null },
      include: this.assetInclude(),
      orderBy: [{ dueDate: 'asc' }, { name: 'asc' }],
    });

    return {
      company,
      assets: rows.map((row) =>
        this.mapAsset({
          ...row,
          file:
            row.file && !row.file.deletedAt
              ? {
                  id: row.file.id,
                  originalName: row.file.originalName,
                  mimeType: row.file.mimeType,
                  size: row.file.size,
                }
              : null,
        }),
      ),
    };
  }

  async createAsset(
    user: AuthenticatedRequestUser,
    companyId: string,
    body: CreateInventoryAssetDto,
    file?: Express.Multer.File,
  ) {
    const scope = await this.getAccessibleCompanyIds(user);
    this.ensureCompanyInScope(companyId, scope);

    const company = await this.prisma.company.findFirst({
      where: { id: companyId, deletedAt: null },
      select: { id: true },
    });
    if (!company) throw new NotFoundException('Empresa não encontrada.');

    const savedFile = file ? await this.saveUploadedFile(user, file) : null;
    const dueDate = this.parseDueDate(body.dueDate);

    const created = await this.prisma.inventoryAsset.create({
      data: {
        companyId,
        name: body.name.trim(),
        unit: body.unit?.trim() || null,
        dueDate: dueDate === undefined ? null : dueDate,
        notes: body.notes?.trim() || null,
        fileId: savedFile?.id ?? null,
        createdBy: user.userId,
      },
      include: this.assetInclude(),
    });

    return this.mapAsset({
      ...created,
      file: created.file
        ? {
            id: created.file.id,
            originalName: created.file.originalName,
            mimeType: created.file.mimeType,
            size: created.file.size,
          }
        : null,
    });
  }

  async updateAsset(
    user: AuthenticatedRequestUser,
    assetId: string,
    body: UpdateInventoryAssetDto,
    file?: Express.Multer.File,
  ) {
    const scope = await this.getAccessibleCompanyIds(user);
    const existing = await this.prisma.inventoryAsset.findFirst({
      where: { id: assetId, deletedAt: null },
      include: { file: true },
    });
    if (!existing) throw new NotFoundException('Ativo não encontrado.');
    this.ensureCompanyInScope(existing.companyId, scope);

    const removeAttachment =
      String(body.removeAttachment ?? '').toLowerCase() === 'true';
    let fileId = existing.fileId;

    if (file) {
      const saved = await this.saveUploadedFile(user, file);
      fileId = saved.id;
    } else if (removeAttachment) {
      fileId = null;
    }

    let dueDate: Date | null | undefined = undefined;
    if (body.clearDueDate === 'true' || body.clearDueDate === '1') {
      dueDate = null;
    } else if (body.dueDate !== undefined) {
      dueDate = this.parseDueDate(body.dueDate);
    }

    const updated = await this.prisma.inventoryAsset.update({
      where: { id: assetId },
      data: {
        name: body.name?.trim(),
        unit:
          body.unit !== undefined ? body.unit.trim() || null : undefined,
        notes:
          body.notes !== undefined ? body.notes.trim() || null : undefined,
        dueDate,
        fileId,
      },
      include: this.assetInclude(),
    });

    return this.mapAsset({
      ...updated,
      file: updated.file
        ? {
            id: updated.file.id,
            originalName: updated.file.originalName,
            mimeType: updated.file.mimeType,
            size: updated.file.size,
          }
        : null,
    });
  }

  async deleteAsset(user: AuthenticatedRequestUser, assetId: string) {
    const scope = await this.getAccessibleCompanyIds(user);
    const existing = await this.prisma.inventoryAsset.findFirst({
      where: { id: assetId, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Ativo não encontrado.');
    this.ensureCompanyInScope(existing.companyId, scope);

    await this.prisma.inventoryAsset.update({
      where: { id: assetId },
      data: { deletedAt: new Date() },
    });

    return { ok: true };
  }

  async downloadAttachment(
    user: AuthenticatedRequestUser,
    fileId: string,
    companyId?: string,
    inline?: boolean,
  ) {
    const scope = await this.getAccessibleCompanyIds(user);
    const asset = await this.prisma.inventoryAsset.findFirst({
      where: {
        fileId,
        deletedAt: null,
        ...(companyId ? { companyId } : {}),
      },
      include: { file: true },
    });
    if (!asset?.file || asset.file.deletedAt) {
      throw new NotFoundException('Anexo não encontrado.');
    }
    this.ensureCompanyInScope(asset.companyId, scope);

    if (!existsSync(asset.file.path)) {
      throw new NotFoundException('Arquivo não encontrado no servidor.');
    }

    return {
      stream: new StreamableFile(createReadStream(asset.file.path)),
      meta: {
        originalName: asset.file.originalName,
        mimeType: asset.file.mimeType,
        inline: Boolean(inline),
      },
    };
  }

  /** Alertas de vencimento para o correio (próximos 30 dias ou vencidos). */
  async listExpiryAlertsForUser(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, role: true, companyId: true },
    });
    if (!user) return [];
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.COLLABORATOR) {
      return [];
    }

    const scope = await this.getAccessibleCompanyIds({
      userId: user.id,
      email: '',
      role: user.role,
      companyId: user.companyId,
      permissions: [],
    });

    const horizon = new Date();
    horizon.setDate(horizon.getDate() + 30);
    horizon.setHours(23, 59, 59, 999);

    const rows = await this.prisma.inventoryAsset.findMany({
      where: {
        companyId: { in: scope },
        deletedAt: null,
        dueDate: { not: null, lte: horizon },
      },
      include: { company: { select: { id: true, name: true } } },
      orderBy: { dueDate: 'asc' },
      take: 40,
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return rows.map((row) => {
      const due = row.dueDate!;
      const dueOnly = new Date(due);
      dueOnly.setHours(0, 0, 0, 0);
      const overdue = dueOnly.getTime() < today.getTime();
      const label = due.toLocaleDateString('pt-BR');
      return {
        assetId: row.id,
        companyId: row.companyId,
        companyName: row.company.name,
        name: row.name,
        dueDate: due.toISOString().slice(0, 10),
        overdue,
        title: overdue ? 'Inventário vencido' : 'Inventário a vencer',
        body: `${row.company.name}: ${row.name} — vencimento ${label}.`,
        href: `/inventario/${row.companyId}`,
        dedupeKey: `inventory:expiry:${row.id}`,
      };
    });
  }
}
