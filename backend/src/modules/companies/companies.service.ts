import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ContractFileType, ContractStatus } from '@prisma/client';
import { isClientPortalRole } from '../../common/security/client-portal-role';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import {
  CreateCompanyContractDto,
  UpdateCompanyContractDto,
} from './dto/company-contract.dto';
import { randomUUID } from 'crypto';
import { createReadStream, existsSync } from 'fs';
import { writeUploadedBuffer } from '../../common/upload/local-file.helper';
import { join } from 'path';
import type { AuthenticatedRequestUser } from '../gmud/gmud.types';
import { StreamableFile } from '@nestjs/common';
import type { AuthenticatedRequestUser as AuthUser } from '../auth/auth-request-user';
import { AuditService } from '../audit/audit.service';
import { DEFAULT_COMPANY_PACK_MODULES } from '../permissions/company-pack.constants';
import { ZabbixService } from '../zabbix/zabbix.service';
import {
  buildZabbixGroupSuggestions,
  type ZabbixGroupSuggestion,
} from './zabbix-group-match.util';
import {
  parseZabbixGroupNames,
  serializeZabbixGroupNames,
} from './zabbix-groups.util';
import type { ApplyZabbixGroupSuggestionItemDto } from './dto/zabbix-group-suggest.dto';
import { assertAllowedUpload } from '../../common/upload.config';

const contractRelationsInclude = {
  contractFiles: {
    include: {
      file: {
        select: {
          id: true,
          originalName: true,
          mimeType: true,
          size: true,
          createdAt: true,
        },
      },
    },
    orderBy: { id: 'desc' as const },
  },
  classification: {
    select: {
      id: true,
      name: true,
      level: true,
      serviceDesk: { select: { id: true, name: true } },
      parent: {
        select: {
          id: true,
          name: true,
          level: true,
          parent: {
            select: { id: true, name: true, level: true },
          },
        },
      },
    },
  },
};

@Injectable()
export class CompaniesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly zabbix: ZabbixService,
  ) {}

  private async resolveClassificationId(classificationId?: string | null) {
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

  private normalizeString(value?: string | null) {
    const normalized = value?.trim() ?? '';
    return normalized.length ? normalized : null;
  }

  private normalizeCnpj(value?: string | null) {
    const normalized = value?.replace(/\D/g, '') ?? '';
    if (!normalized) return null;
    if (normalized.length !== 14) {
      throw new BadRequestException('CNPJ inválido. Use 14 dígitos.');
    }
    return normalized;
  }

  private async validateUniqueEmail(email: string, ignoreId?: string) {
    const existing = await this.prisma.company.findFirst({
      where: {
        email,
        deletedAt: null,
        ...(ignoreId
          ? {
              id: {
                not: ignoreId,
              },
            }
          : {}),
      },
    });

    if (existing) {
      throw new BadRequestException('Já existe uma empresa com este e-mail');
    }
  }

  private async validateUniqueCnpj(cnpj: string | null, ignoreId?: string) {
    if (!cnpj) return;

    const existing = await this.prisma.company.findFirst({
      where: {
        cnpj,
        deletedAt: null,
        ...(ignoreId
          ? {
              id: {
                not: ignoreId,
              },
            }
          : {}),
      },
    });

    if (existing) {
      throw new BadRequestException('Já existe uma empresa com este CNPJ');
    }
  }

  private async validateUniqueZabbixGroup(
    zabbixGroupName: string | null,
    ignoreId?: string,
  ) {
    const groupNames = parseZabbixGroupNames(zabbixGroupName);
    if (!groupNames.length) {
      return;
    }

    const requested = new Set(groupNames.map((group) => group.toLowerCase()));
    const companies = await this.prisma.company.findMany({
      where: {
        deletedAt: null,
        ...(ignoreId
          ? {
              id: {
                not: ignoreId,
              },
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        zabbixGroupName: true,
      },
    });

    for (const company of companies) {
      const duplicated = parseZabbixGroupNames(company.zabbixGroupName).find(
        (group) => requested.has(group.toLowerCase()),
      );
      if (duplicated) {
        throw new BadRequestException(
          `O grupo do Zabbix "${duplicated}" já está vinculado à empresa ${company.name}`,
        );
      }
    }
  }

  private async validateUniqueTifluxClient(
    tifluxClientId: number | null,
    ignoreId?: string,
  ) {
    if (tifluxClientId === null || tifluxClientId === undefined) {
      return;
    }

    const existing = await this.prisma.company.findFirst({
      where: {
        tifluxClientId,
        deletedAt: null,
        ...(ignoreId
          ? {
              id: {
                not: ignoreId,
              },
            }
          : {}),
      },
    });

    if (existing) {
      throw new BadRequestException(
        'Este cliente do TiFlux já está vinculado a outra empresa',
      );
    }
  }

  async findAll() {
    const companies = await this.prisma.company.findMany({
      where: {
        deletedAt: null,
      },
      orderBy: {
        name: 'asc',
      },
    });

    // Contadores:
    // - contratos: contracts (deletedAt null)
    // - documentos: contract_files vinculados aos contracts (deletedAt null)
    const contracts = await this.prisma.contract.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        companyId: true,
        _count: { select: { contractFiles: true } },
      },
    });

    const byCompany = new Map<
      string,
      { contracts: number; documents: number }
    >();
    for (const c of contracts) {
      const prev = byCompany.get(c.companyId) ?? { contracts: 0, documents: 0 };
      byCompany.set(c.companyId, {
        contracts: prev.contracts + 1,
        documents: prev.documents + (c._count?.contractFiles ?? 0),
      });
    }

    return companies.map((c) => {
      const counts = byCompany.get(c.id) ?? { contracts: 0, documents: 0 };
      return {
        ...c,
        contractsCount: counts.contracts,
        documentsCount: counts.documents,
      };
    });
  }

  async findOne(id: string) {
    const company = await this.prisma.company.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

    if (!company) {
      throw new NotFoundException('Empresa não encontrada');
    }

    return company;
  }

  async create(actor: AuthUser, data: CreateCompanyDto) {
    const name = data.name.trim();
    const responsibleName = data.responsibleName.trim();
    const email = data.email.trim().toLowerCase();
    const cnpj = this.normalizeCnpj(data.cnpj);
    const address = this.normalizeString(data.address);
    const zabbixGroupName = serializeZabbixGroupNames(data.zabbixGroupName);
    const tifluxClientId = data.tifluxClientId ?? null;
    const tifluxClientName = this.normalizeString(data.tifluxClientName);

    await this.validateUniqueEmail(email);
    await this.validateUniqueCnpj(cnpj);
    await this.validateUniqueZabbixGroup(zabbixGroupName);
    await this.validateUniqueTifluxClient(tifluxClientId);

    const created = await this.prisma.company.create({
      data: {
        name,
        responsibleName,
        email,
        cnpj,
        address,
        zabbixGroupName,
        tifluxClientId,
        tifluxClientName,
        status: data.status ?? true,
        monitoringPriority: data.monitoringPriority ?? false,
      },
    });

    await this.prisma.companyModule.createMany({
      data: DEFAULT_COMPANY_PACK_MODULES.map((module) => ({
        companyId: created.id,
        module,
        enabled: true,
      })),
      skipDuplicates: true,
    });

    await this.audit.log({
      actor,
      action: 'CREATE',
      entity: 'Company',
      entityId: created.id,
      payload: {
        before: null,
        after: {
          id: created.id,
          name: created.name,
          email: created.email,
          responsibleName: created.responsibleName,
          cnpj: created.cnpj,
          address: created.address,
          status: created.status,
          zabbixGroupName: created.zabbixGroupName,
          tifluxClientId: created.tifluxClientId,
          tifluxClientName: created.tifluxClientName,
        },
      },
    });

    return created;
  }

  async update(actor: AuthUser, id: string, data: UpdateCompanyDto) {
    const existingCompany = await this.prisma.company.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

    if (!existingCompany) {
      throw new NotFoundException('Empresa não encontrada');
    }

    const email =
      data.email !== undefined
        ? data.email.trim().toLowerCase()
        : existingCompany.email;
    const cnpj =
      data.cnpj !== undefined
        ? this.normalizeCnpj(data.cnpj)
        : existingCompany.cnpj;
    const address =
      data.address !== undefined
        ? this.normalizeString(data.address)
        : existingCompany.address;

    const zabbixGroupName =
      data.zabbixGroupName !== undefined
        ? serializeZabbixGroupNames(data.zabbixGroupName)
        : existingCompany.zabbixGroupName;

    const tifluxClientId =
      data.tifluxClientId !== undefined
        ? data.tifluxClientId
        : existingCompany.tifluxClientId;

    const tifluxClientName =
      data.tifluxClientName !== undefined
        ? this.normalizeString(data.tifluxClientName)
        : existingCompany.tifluxClientName;

    if (email !== existingCompany.email) {
      await this.validateUniqueEmail(email, id);
    }

    if (cnpj !== existingCompany.cnpj) {
      await this.validateUniqueCnpj(cnpj, id);
    }

    if (zabbixGroupName !== existingCompany.zabbixGroupName) {
      await this.validateUniqueZabbixGroup(zabbixGroupName, id);
    }

    if (tifluxClientId !== existingCompany.tifluxClientId) {
      await this.validateUniqueTifluxClient(tifluxClientId, id);
    }

    const updated = await this.prisma.company.update({
      where: {
        id,
      },
      data: {
        ...(data.name !== undefined && { name: data.name.trim() }),
        ...(data.responsibleName !== undefined && {
          responsibleName: data.responsibleName.trim(),
        }),
        ...(data.email !== undefined && { email }),
        ...(data.cnpj !== undefined && { cnpj }),
        ...(data.address !== undefined && { address }),
        ...(data.zabbixGroupName !== undefined && { zabbixGroupName }),
        ...(data.tifluxClientId !== undefined && { tifluxClientId }),
        ...(data.tifluxClientName !== undefined && { tifluxClientName }),
        ...(data.status !== undefined && { status: data.status }),
        ...(data.monitoringPriority !== undefined && {
          monitoringPriority: data.monitoringPriority,
        }),
      },
    });

    await this.audit.log({
      actor,
      action: 'UPDATE',
      entity: 'Company',
      entityId: id,
      payload: {
        before: {
          id: existingCompany.id,
          name: existingCompany.name,
          email: existingCompany.email,
          responsibleName: existingCompany.responsibleName,
          cnpj: existingCompany.cnpj,
          address: existingCompany.address,
          status: existingCompany.status,
          zabbixGroupName: existingCompany.zabbixGroupName,
          tifluxClientId: existingCompany.tifluxClientId,
          tifluxClientName: existingCompany.tifluxClientName,
        },
        after: {
          id: updated.id,
          name: updated.name,
          email: updated.email,
          responsibleName: updated.responsibleName,
          cnpj: updated.cnpj,
          address: updated.address,
          status: updated.status,
          zabbixGroupName: updated.zabbixGroupName,
          tifluxClientId: updated.tifluxClientId,
          tifluxClientName: updated.tifluxClientName,
        },
      },
    });

    return updated;
  }

  async remove(actor: AuthUser, id: string) {
    const existingCompany = await this.prisma.company.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

    if (!existingCompany) {
      throw new NotFoundException('Empresa não encontrada');
    }

    const removed = await this.prisma.company.update({
      where: {
        id,
      },
      data: {
        deletedAt: new Date(),
        status: false,
      },
    });

    await this.audit.log({
      actor,
      action: 'DELETE',
      entity: 'Company',
      entityId: id,
      payload: {
        before: {
          id: existingCompany.id,
          status: existingCompany.status,
          deletedAt: existingCompany.deletedAt,
        },
        after: {
          id: removed.id,
          status: removed.status,
          deletedAt: removed.deletedAt,
        },
      },
    });

    return removed;
  }

  async listContracts(companyId: string) {
    const company = await this.findOne(companyId);

    const contracts = await this.prisma.contract.findMany({
      where: {
        companyId: company.id,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      include: contractRelationsInclude,
    });

    const now = new Date();
    const normalized = contracts.map((c) => {
      const effectiveStatus =
        c.endDate && c.endDate.getTime() < now.getTime()
          ? ContractStatus.EXPIRED
          : c.status;
      return { ...c, status: effectiveStatus };
    });

    return {
      company: { id: company.id, name: company.name },
      contracts: normalized,
    };
  }

  async createContract(companyId: string, dto: CreateCompanyContractDto) {
    const company = await this.findOne(companyId);

    const startDate = new Date(dto.startDate);
    if (Number.isNaN(startDate.getTime())) {
      throw new BadRequestException('Data de início inválida');
    }

    const endDate = dto.endDate ? new Date(dto.endDate) : null;
    if (dto.endDate && endDate && Number.isNaN(endDate.getTime())) {
      throw new BadRequestException('Data de término inválida');
    }

    if (endDate && endDate <= startDate) {
      throw new BadRequestException(
        'Data de término deve ser maior que a data de início',
      );
    }

    const title = dto.title.trim();
    if (!title) throw new BadRequestException('Título é obrigatório');

    const classificationId = await this.resolveClassificationId(
      dto.classificationId,
    );

    return this.prisma.contract.create({
      data: {
        companyId: company.id,
        classificationId,
        title,
        description: dto.description?.trim() || null,
        status: dto.status ?? ContractStatus.ACTIVE,
        monthlyHours: dto.monthlyHours,
        extraHourPrice: dto.extraHourPrice,
        startDate,
        endDate,
      },
      include: contractRelationsInclude,
    });
  }

  async updateContract(
    companyId: string,
    contractId: string,
    dto: UpdateCompanyContractDto,
  ) {
    const company = await this.findOne(companyId);

    const existing = await this.prisma.contract.findFirst({
      where: { id: contractId, companyId: company.id, deletedAt: null },
    });
    if (!existing) throw new NotFoundException('Contrato não encontrado');

    const startDate =
      dto.startDate !== undefined
        ? new Date(dto.startDate)
        : existing.startDate;
    if (dto.startDate !== undefined && Number.isNaN(startDate.getTime())) {
      throw new BadRequestException('Data de início inválida');
    }

    const endDate =
      dto.endDate !== undefined
        ? dto.endDate
          ? new Date(dto.endDate)
          : null
        : existing.endDate;
    if (
      dto.endDate !== undefined &&
      dto.endDate &&
      endDate &&
      Number.isNaN(endDate.getTime())
    ) {
      throw new BadRequestException('Data de término inválida');
    }

    if (endDate && endDate <= startDate) {
      throw new BadRequestException(
        'Data de término deve ser maior que a data de início',
      );
    }

    let classificationId: string | null | undefined;
    if (dto.classificationId !== undefined) {
      classificationId = await this.resolveClassificationId(
        dto.classificationId,
      );
    }

    return this.prisma.contract.update({
      where: { id: existing.id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description?.trim() || null }
          : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.monthlyHours !== undefined
          ? { monthlyHours: dto.monthlyHours }
          : {}),
        ...(dto.extraHourPrice !== undefined
          ? { extraHourPrice: dto.extraHourPrice }
          : {}),
        ...(dto.startDate !== undefined ? { startDate } : {}),
        ...(dto.endDate !== undefined ? { endDate } : {}),
        ...(dto.classificationId !== undefined ? { classificationId } : {}),
      },
      include: contractRelationsInclude,
    });
  }

  async deleteContract(companyId: string, contractId: string) {
    const company = await this.findOne(companyId);
    const existing = await this.prisma.contract.findFirst({
      where: { id: contractId, companyId: company.id, deletedAt: null },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Contrato não encontrado');

    return this.prisma.contract.update({
      where: { id: existing.id },
      data: { deletedAt: new Date(), status: ContractStatus.INACTIVE },
    });
  }

  async uploadContractFile(
    user: AuthenticatedRequestUser,
    companyId: string,
    contractId: string,
    file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Arquivo não enviado');
    }
    assertAllowedUpload(file);

    const company = await this.findOne(companyId);
    const contract = await this.prisma.contract.findFirst({
      where: { id: contractId, companyId: company.id, deletedAt: null },
    });
    if (!contract) {
      throw new NotFoundException('Contrato não encontrado');
    }

    const maxBytes = 15 * 1024 * 1024;
    if (file.size > maxBytes) {
      throw new BadRequestException('Arquivo excede o limite de 15MB');
    }

    const uploadsDir = join(process.cwd(), 'uploads', 'contracts', contract.id);

    const safeName = file.originalname.replace(/[^\w.\-() ]+/g, '_');
    const targetName = `${randomUUID()}-${safeName}`;
    const targetPath = join(uploadsDir, targetName);
    await writeUploadedBuffer(targetPath, file.buffer);

    const created = await this.prisma.file.create({
      data: {
        originalName: file.originalname,
        mimeType: file.mimetype,
        path: targetPath,
        size: file.size,
        uploadedBy: user.userId,
      },
    });

    // mantemos 1 arquivo do tipo CONTRACT (substitui se já existir)
    const existingFile = await this.prisma.contractFile.findFirst({
      where: { contractId: contract.id, type: ContractFileType.CONTRACT },
      select: { id: true },
    });

    if (existingFile) {
      await this.prisma.contractFile.delete({ where: { id: existingFile.id } });
    }

    return this.prisma.contractFile.create({
      data: {
        contractId: contract.id,
        fileId: created.id,
        type: ContractFileType.CONTRACT,
      },
      include: {
        file: {
          select: {
            id: true,
            originalName: true,
            mimeType: true,
            size: true,
            createdAt: true,
          },
        },
      },
    });
  }

  async uploadLogo(
    user: AuthenticatedRequestUser,
    companyId: string,
    file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Arquivo não enviado');
    const mime = (file.mimetype || '').toLowerCase();
    if (!mime.startsWith('image/')) {
      throw new BadRequestException(
        'Logo deve ser uma imagem (PNG, JPG, etc.).',
      );
    }
    assertAllowedUpload(file);
    const company = await this.findOne(companyId);

    const maxBytes = 5 * 1024 * 1024;
    if (file.size > maxBytes) {
      throw new BadRequestException('Logo excede o limite de 5MB');
    }

    const uploadsDir = join(
      process.cwd(),
      'uploads',
      'companies',
      company.id,
      'logo',
    );
    const safeName = file.originalname.replace(/[^\w.\-() ]+/g, '_');
    const targetName = `${randomUUID()}-${safeName}`;
    const targetPath = join(uploadsDir, targetName);
    await writeUploadedBuffer(targetPath, file.buffer);

    const created = await this.prisma.file.create({
      data: {
        originalName: file.originalname,
        mimeType: file.mimetype,
        path: targetPath,
        size: file.size,
        uploadedBy: user.userId,
      },
      select: {
        id: true,
        originalName: true,
        mimeType: true,
        size: true,
        createdAt: true,
      },
    });

    await this.prisma.company.update({
      where: { id: company.id },
      data: { logoFileId: created.id },
    });

    return { companyId: company.id, logoFileId: created.id, file: created };
  }

  async downloadLogo(user: AuthenticatedRequestUser, companyId: string) {
    // ADMIN-only controller already, but keep minimal guard for future use
    if (
      isClientPortalRole(user.role) &&
      user.companyId &&
      user.companyId !== companyId
    ) {
      throw new ForbiddenException('Sem acesso à empresa informada');
    }

    const company = await this.prisma.company.findFirst({
      where: { id: companyId, deletedAt: null },
      select: {
        id: true,
        logoFileId: true,
        logoFile: {
          select: { originalName: true, mimeType: true, path: true },
        },
      },
    });
    if (!company) throw new NotFoundException('Empresa não encontrada');
    if (!company.logoFile || !company.logoFileId)
      throw new NotFoundException('Logo não cadastrada');
    if (!existsSync(company.logoFile.path))
      throw new NotFoundException('Arquivo não encontrado no servidor');

    return {
      file: new StreamableFile(createReadStream(company.logoFile.path)),
      meta: {
        originalName: company.logoFile.originalName,
        mimeType: company.logoFile.mimeType,
      },
    };
  }

  async removeLogo(companyId: string) {
    const company = await this.prisma.company.findFirst({
      where: { id: companyId, deletedAt: null },
      select: { id: true },
    });
    if (!company) throw new NotFoundException('Empresa não encontrada');

    await this.prisma.company.update({
      where: { id: company.id },
      data: { logoFileId: null },
    });

    return { companyId: company.id, logoFileId: null };
  }

  async listZabbixGroups() {
    const groups = await this.zabbix.getGroups();
    return groups.map((group) => ({
      groupid: group.groupid,
      name: group.name,
    }));
  }

  async searchZabbixGroups(query: string) {
    const groups = await this.zabbix.searchGroups(query);
    return groups.map((group) => ({
      groupid: group.groupid,
      name: group.name,
    }));
  }

  async validateZabbixGroupName(name: string) {
    const resolved = await this.zabbix.resolveGroupByName(name);
    return {
      input: name.trim(),
      exists: resolved.exists,
      canonicalName: resolved.name,
      groupid: resolved.groupid,
    };
  }

  async suggestZabbixGroupMatches(options?: {
    minScore?: number;
    onlyInvalid?: boolean;
  }): Promise<{
    groupsAvailable: number;
    suggestions: ZabbixGroupSuggestion[];
  }> {
    const [companies, groups] = await Promise.all([
      this.prisma.company.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true, zabbixGroupName: true },
        orderBy: { name: 'asc' },
      }),
      this.zabbix.getGroups(),
    ]);

    const groupByExact = new Map(
      groups.map((group) => [group.name.toLowerCase(), group.name]),
    );

    const assignedGroups = new Set<string>();
    for (const company of companies) {
      for (const current of parseZabbixGroupNames(company.zabbixGroupName)) {
        if (groupByExact.has(current.toLowerCase())) {
          assignedGroups.add(current.toLowerCase());
        }
      }
    }

    const suggestions = buildZabbixGroupSuggestions({
      companies,
      groups,
      minScore: options?.minScore,
      onlyWithoutValidGroup: options?.onlyInvalid !== false,
      assignedGroups,
    });

    return {
      groupsAvailable: groups.length,
      suggestions,
    };
  }

  async applyZabbixGroupSuggestions(
    actor: AuthUser,
    items: ApplyZabbixGroupSuggestionItemDto[],
  ) {
    const results: Array<{
      companyId: string;
      companyName: string;
      zabbixGroupName: string;
      applied: boolean;
      message?: string;
    }> = [];

    for (const item of items) {
      const company = await this.prisma.company.findFirst({
        where: { id: item.companyId, deletedAt: null },
        select: { id: true, name: true, zabbixGroupName: true },
      });

      if (!company) {
        results.push({
          companyId: item.companyId,
          companyName: '—',
          zabbixGroupName: item.zabbixGroupName,
          applied: false,
          message: 'Empresa não encontrada',
        });
        continue;
      }

      const resolved = await this.zabbix.resolveGroupByName(
        item.zabbixGroupName,
      );
      if (!resolved.exists || !resolved.name) {
        results.push({
          companyId: company.id,
          companyName: company.name,
          zabbixGroupName: item.zabbixGroupName,
          applied: false,
          message: 'Grupo não existe no Zabbix',
        });
        continue;
      }

      try {
        await this.validateUniqueZabbixGroup(resolved.name, company.id);
      } catch (error) {
        results.push({
          companyId: company.id,
          companyName: company.name,
          zabbixGroupName: resolved.name,
          applied: false,
          message:
            error instanceof BadRequestException
              ? String(error.message)
              : 'Grupo já vinculado a outra empresa',
        });
        continue;
      }

      const updated = await this.prisma.company.update({
        where: { id: company.id },
        data: { zabbixGroupName: resolved.name },
      });

      await this.audit.log({
        actor,
        action: 'UPDATE',
        entity: 'Company',
        entityId: company.id,
        payload: {
          field: 'zabbixGroupName',
          before: company.zabbixGroupName,
          after: updated.zabbixGroupName,
          source: 'zabbix_group_suggest',
        },
      });

      results.push({
        companyId: company.id,
        companyName: company.name,
        zabbixGroupName: resolved.name,
        applied: true,
      });
    }

    return {
      total: results.length,
      applied: results.filter((row) => row.applied).length,
      results,
    };
  }
}
