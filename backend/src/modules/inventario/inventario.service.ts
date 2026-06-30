import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { createReadStream, existsSync } from 'fs';
import { writeUploadedBuffer } from '../../common/upload/local-file.helper';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { StreamableFile } from '@nestjs/common';
import {
  assertAllowedUploadMime,
  UPLOAD_MAX_BYTES,
} from '../../common/upload.config';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedRequestUser } from '../auth/auth-request-user';
import type {
  CreateInventoryAssetDto,
  CreateInventoryAssetTypeDto,
  INVENTORY_REMINDER_DAYS,
  UpdateInventoryAssetDto,
} from './inventario.dto';

export const INVENTORY_DEFAULT_SUPPLIER = 'Alle Tecnologia';

export type InventoryAssetDto = {
  id: string;
  companyId: string;
  assetTypeId: string;
  assetTypeName: string;
  name: string;
  brand: string | null;
  quantity: number | null;
  supplier: string | null;
  supplierThirdParty: boolean;
  description: string | null;
  dueDate: string | null;
  reminderDaysBefore: number | null;
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private assertCanMutate(user: AuthenticatedRequestUser) {
    if (user.role === UserRole.CLIENT) {
      throw new ForbiddenException('Cliente pode apenas visualizar o inventário.');
    }
  }

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

  private startOfDay(date = new Date()) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private parseReminderDays(
    value?: number | null,
  ): (typeof INVENTORY_REMINDER_DAYS)[number] | null {
    if (value === undefined || value === null) return null;
    const n = Number(value);
    if (![90, 30, 15, 7].includes(n)) {
      throw new BadRequestException(
        'Lembrete inválido. Use 90, 30, 15 ou 7 dias antes do vencimento.',
      );
    }
    return n as (typeof INVENTORY_REMINDER_DAYS)[number];
  }

  private async resolveAssetType(assetTypeId: string) {
    const type = await this.prisma.inventoryAssetType.findFirst({
      where: { id: assetTypeId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!type) {
      throw new BadRequestException('Tipo de ativo inválido.');
    }
    return type;
  }

  private mapAsset(row: {
    id: string;
    companyId: string;
    assetTypeId: string;
    name: string;
    brand: string | null;
    quantity: number | null;
    supplier: string | null;
    supplierThirdParty: boolean;
    description: string | null;
    dueDate: Date | null;
    reminderDaysBefore: number | null;
    createdAt: Date;
    updatedAt: Date;
    assetType: { name: string };
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
      assetTypeId: row.assetTypeId,
      assetTypeName: row.assetType.name,
      name: row.name,
      brand: row.brand,
      quantity: row.quantity,
      supplier: row.supplier,
      supplierThirdParty: row.supplierThirdParty,
      description: row.description,
      dueDate: row.dueDate ? row.dueDate.toISOString().slice(0, 10) : null,
      reminderDaysBefore: row.reminderDaysBefore,
      file: row.file,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private parseQuantity(value?: string | null): number | null {
    if (value === undefined || value === null) return null;
    const trimmed = String(value).trim();
    if (!trimmed) return null;
    const n = Number(trimmed);
    if (!Number.isInteger(n) || n < 0) {
      throw new BadRequestException(
        'Quantidade inválida. Informe um número inteiro maior ou igual a zero.',
      );
    }
    return n;
  }

  private parseBoolean(value?: string | null): boolean {
    const normalized = String(value ?? '').trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'sim';
  }

  /**
   * Resolve o fornecedor a partir do campo lógico "fornecedor terceiro?".
   * Quando NÃO é terceiro, preenche automaticamente com o fornecedor padrão.
   * Quando É terceiro, exige o nome digitado.
   */
  private resolveSupplier(
    thirdPartyRaw?: string | null,
    supplierRaw?: string | null,
  ): { supplierThirdParty: boolean; supplier: string } {
    const thirdParty = this.parseBoolean(thirdPartyRaw);
    if (!thirdParty) {
      return { supplierThirdParty: false, supplier: INVENTORY_DEFAULT_SUPPLIER };
    }
    const supplier = String(supplierRaw ?? '').trim();
    if (!supplier) {
      throw new BadRequestException(
        'Informe o nome do fornecedor terceiro.',
      );
    }
    return { supplierThirdParty: true, supplier };
  }

  private assetInclude() {
    return {
      assetType: { select: { id: true, name: true } },
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

  private validateReminderWithDueDate(
    dueDate: Date | null | undefined,
    reminderDaysBefore: number | null | undefined,
  ) {
    if (reminderDaysBefore != null && !dueDate) {
      throw new BadRequestException(
        'Informe a data de vencimento para configurar o lembrete.',
      );
    }
  }

  private async saveUploadedFile(
    user: AuthenticatedRequestUser,
    file: Express.Multer.File,
  ) {
    if (file.size > UPLOAD_MAX_BYTES) {
      throw new BadRequestException('Arquivo excede o limite de 10MB');
    }
    assertAllowedUploadMime(file.mimetype);

    const uploadsDir = join(process.cwd(), 'uploads', 'inventory');
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const targetName = `${Date.now()}-${randomUUID()}-${safeName}`;
    const targetPath = join(uploadsDir, targetName);
    await writeUploadedBuffer(targetPath, file.buffer);

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

  async listAssetTypes() {
    return this.prisma.inventoryAssetType.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  async createAssetType(body: CreateInventoryAssetTypeDto) {
    const name = body.name.trim();
    const existing = await this.prisma.inventoryAssetType.findFirst({
      where: { name: { equals: name, mode: 'insensitive' }, deletedAt: null },
    });
    if (existing) {
      throw new BadRequestException('Já existe um tipo de ativo com este nome.');
    }
    const created = await this.prisma.inventoryAssetType.create({
      data: { name },
      select: { id: true, name: true },
    });

    // actor não é obrigatório nesse endpoint (mas só ADMIN/COLLABORATOR chamam),
    // então o interceptor já registra; aqui só registramos diffs se no futuro
    // o controller passar actor explicitamente.
    await this.audit.log({
      actor: null,
      action: 'CREATE',
      entity: 'InventoryAssetType',
      entityId: created.id,
      payload: { before: null, after: created },
    });

    return created;
  }

  async listCompanies(user: AuthenticatedRequestUser) {
    const scope = await this.getAccessibleCompanyIds(user);
    const today = this.startOfDay();

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

    const expiredGroups = await this.prisma.inventoryAsset.groupBy({
      by: ['companyId'],
      where: {
        companyId: { in: scope },
        deletedAt: null,
        dueDate: { not: null, lt: today },
      },
      _count: { _all: true },
    });
    const expiredMap = new Map(
      expiredGroups.map((g) => [g.companyId, g._count._all]),
    );

    return companies.map((c) => ({
      id: c.id,
      name: c.name,
      assetsCount: c._count.inventoryAssets,
      expiredCount: expiredMap.get(c.id) ?? 0,
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
    this.assertCanMutate(user);
    const scope = await this.getAccessibleCompanyIds(user);
    this.ensureCompanyInScope(companyId, scope);

    const company = await this.prisma.company.findFirst({
      where: { id: companyId, deletedAt: null },
      select: { id: true },
    });
    if (!company) throw new NotFoundException('Empresa não encontrada.');

    const assetType = await this.resolveAssetType(body.assetTypeId);
    const dueDate = this.parseDueDate(body.dueDate);
    const reminderDaysBefore = this.parseReminderDays(body.reminderDaysBefore);
    this.validateReminderWithDueDate(
      dueDate === undefined ? null : dueDate,
      reminderDaysBefore,
    );

    const savedFile = file ? await this.saveUploadedFile(user, file) : null;
    const quantity = this.parseQuantity(body.quantity);
    const { supplier, supplierThirdParty } = this.resolveSupplier(
      body.supplierThirdParty,
      body.supplier,
    );

    const created = await this.prisma.inventoryAsset.create({
      data: {
        companyId,
        assetTypeId: assetType.id,
        name: assetType.name,
        brand: body.brand?.trim() || null,
        quantity,
        supplier,
        supplierThirdParty,
        description: body.description?.trim() || null,
        dueDate: dueDate === undefined ? null : dueDate,
        reminderDaysBefore,
        fileId: savedFile?.id ?? null,
        createdBy: user.userId,
      },
      include: this.assetInclude(),
    });

    await this.audit.log({
      actor: user,
      action: 'CREATE',
      entity: 'InventoryAsset',
      entityId: created.id,
      payload: {
        before: null,
        after: {
          id: created.id,
          companyId: created.companyId,
          assetTypeId: created.assetTypeId,
          name: created.name,
          brand: created.brand,
          quantity: created.quantity,
          supplier: created.supplier,
          supplierThirdParty: created.supplierThirdParty,
          description: created.description,
          dueDate: created.dueDate ? created.dueDate.toISOString().slice(0, 10) : null,
          reminderDaysBefore: created.reminderDaysBefore,
          fileId: created.fileId,
          createdBy: created.createdBy,
        },
      },
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
    this.assertCanMutate(user);
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

    let reminderDaysBefore: number | null | undefined = undefined;
    if (body.clearReminder === 'true' || body.clearReminder === '1') {
      reminderDaysBefore = null;
    } else if (body.reminderDaysBefore !== undefined) {
      reminderDaysBefore = this.parseReminderDays(body.reminderDaysBefore);
    }

    const nextDueDate = dueDate !== undefined ? dueDate : existing.dueDate;
    const nextReminder =
      reminderDaysBefore !== undefined
        ? reminderDaysBefore
        : existing.reminderDaysBefore;
    this.validateReminderWithDueDate(nextDueDate, nextReminder);

    let assetTypeId = existing.assetTypeId;
    let name = existing.name;
    if (body.assetTypeId) {
      const assetType = await this.resolveAssetType(body.assetTypeId);
      assetTypeId = assetType.id;
      name = assetType.name;
    }

    const brand =
      body.brand !== undefined ? body.brand.trim() || null : undefined;
    const quantity =
      body.quantity !== undefined ? this.parseQuantity(body.quantity) : undefined;

    let supplier: string | undefined;
    let supplierThirdParty: boolean | undefined;
    if (body.supplierThirdParty !== undefined) {
      const resolved = this.resolveSupplier(
        body.supplierThirdParty,
        body.supplier,
      );
      supplier = resolved.supplier;
      supplierThirdParty = resolved.supplierThirdParty;
    }

    const updated = await this.prisma.inventoryAsset.update({
      where: { id: assetId },
      data: {
        assetTypeId,
        name,
        brand,
        quantity,
        supplier,
        supplierThirdParty,
        description:
          body.description !== undefined
            ? body.description.trim() || null
            : undefined,
        dueDate,
        reminderDaysBefore,
        fileId,
      },
      include: this.assetInclude(),
    });

    await this.audit.log({
      actor: user,
      action: 'UPDATE',
      entity: 'InventoryAsset',
      entityId: assetId,
      payload: {
        before: {
          id: existing.id,
          companyId: existing.companyId,
          assetTypeId: existing.assetTypeId,
          name: existing.name,
          brand: existing.brand,
          quantity: existing.quantity,
          supplier: existing.supplier,
          supplierThirdParty: existing.supplierThirdParty,
          description: existing.description,
          dueDate: existing.dueDate ? existing.dueDate.toISOString().slice(0, 10) : null,
          reminderDaysBefore: existing.reminderDaysBefore,
          fileId: existing.fileId,
        },
        after: {
          id: updated.id,
          companyId: updated.companyId,
          assetTypeId: updated.assetTypeId,
          name: updated.name,
          brand: updated.brand,
          quantity: updated.quantity,
          supplier: updated.supplier,
          supplierThirdParty: updated.supplierThirdParty,
          description: updated.description,
          dueDate: updated.dueDate ? updated.dueDate.toISOString().slice(0, 10) : null,
          reminderDaysBefore: updated.reminderDaysBefore,
          fileId: updated.fileId,
        },
      },
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
    this.assertCanMutate(user);
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

    await this.audit.log({
      actor: user,
      action: 'DELETE',
      entity: 'InventoryAsset',
      entityId: assetId,
      payload: {
        before: {
          id: existing.id,
          deletedAt: existing.deletedAt,
        },
        after: {
          id: existing.id,
          deletedAt: new Date().toISOString(),
        },
      },
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

  /** Alertas de lembrete e vencimento para o correio. */
  async listExpiryAlertsForUser(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, role: true, companyId: true },
    });
    if (!user) return [];
    if (
      user.role !== UserRole.ADMIN &&
      user.role !== UserRole.COLLABORATOR &&
      user.role !== UserRole.CLIENT
    ) {
      return [];
    }

    const scope = await this.getAccessibleCompanyIds({
      userId: user.id,
      email: '',
      role: user.role,
      companyId: user.companyId,
      permissions: [],
    });

    const rows = await this.prisma.inventoryAsset.findMany({
      where: {
        companyId: { in: scope },
        deletedAt: null,
        dueDate: { not: null },
      },
      include: {
        company: { select: { id: true, name: true } },
        assetType: { select: { name: true } },
      },
      orderBy: { dueDate: 'asc' },
      take: 80,
    });

    const today = this.startOfDay();
    const alerts: Array<{
      assetId: string;
      companyId: string;
      companyName: string;
      name: string;
      dueDate: string;
      overdue: boolean;
      title: string;
      body: string;
      href: string;
      dedupeKey: string;
    }> = [];

    for (const row of rows) {
      const due = row.dueDate!;
      const dueOnly = this.startOfDay(due);
      const overdue = dueOnly.getTime() < today.getTime();
      const label = due.toLocaleDateString('pt-BR');
      const displayName = row.assetType?.name ?? row.name;

      if (overdue) {
        alerts.push({
          assetId: row.id,
          companyId: row.companyId,
          companyName: row.company.name,
          name: displayName,
          dueDate: due.toISOString().slice(0, 10),
          overdue: true,
          title: 'Inventário vencido',
          body: `${row.company.name}: ${displayName} — vencido em ${label}.`,
          href: `/inventario/${row.companyId}`,
          dedupeKey: `inventory:expiry:${row.id}`,
        });
        continue;
      }

      if (row.reminderDaysBefore == null) continue;

      const reminderStart = new Date(dueOnly);
      reminderStart.setDate(reminderStart.getDate() - row.reminderDaysBefore);
      if (today.getTime() < reminderStart.getTime()) continue;

      alerts.push({
        assetId: row.id,
        companyId: row.companyId,
        companyName: row.company.name,
        name: displayName,
        dueDate: due.toISOString().slice(0, 10),
        overdue: false,
        title: 'Lembrete de inventário',
        body: `${row.company.name}: ${displayName} — vence em ${label} (lembrete ${row.reminderDaysBefore} dias antes).`,
        href: `/inventario/${row.companyId}`,
        dedupeKey: `inventory:reminder:${row.id}:${row.reminderDaysBefore}`,
      });
    }

    return alerts.slice(0, 40);
  }
}
