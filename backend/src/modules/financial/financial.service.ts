import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { StreamableFile } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedRequestUser } from '../gmud/gmud.types';
import type { FinancialOverviewQueryDto } from './financial.dto';
import { createReadStream, existsSync } from 'fs';
import { ContractFileType, ContractStatus } from '@prisma/client';
import { isClientPortalRole } from '../../common/security/client-portal-role';
import { TifluxService } from '../tiflux/tiflux.service';
import { DashboardService } from '../dashboard/dashboard.service';
import {
  computeFinancialOverviewTotals,
  contractedHoursFromContract,
  extraHourPriceFromContract,
  toFinancialNumber,
} from './financial-overview.util';

@Injectable()
export class FinancialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tiflux: TifluxService,
    private readonly dashboard: DashboardService,
  ) {}

  private async resolveCompanyId(
    user: AuthenticatedRequestUser,
    companyId?: string,
  ) {
    if (isClientPortalRole(user.role)) {
      if (!user.companyId) {
        throw new ForbiddenException('Usuário CLIENT sem empresa vinculada');
      }
      return user.companyId;
    }

    if (!companyId) {
      throw new ForbiddenException('companyId é obrigatório para este perfil');
    }

    return companyId;
  }

  async getOverview(
    user: AuthenticatedRequestUser,
    query: FinancialOverviewQueryDto,
  ) {
    const resolvedCompanyId = await this.resolveCompanyId(
      user,
      query.companyId,
    );

    const company = await this.prisma.company.findFirst({
      where: { id: resolvedCompanyId, deletedAt: null },
      select: { id: true, name: true, tifluxClientId: true },
    });

    if (!company) {
      throw new NotFoundException('Empresa não encontrada');
    }

    const contracts = await this.prisma.contract.findMany({
      where: { companyId: company.id, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        status: true,
        monthlyHours: true,
        extraHourPrice: true,
        startDate: true,
        endDate: true,
        specialties: {
          select: {
            monthlyHours: true,
            unlimited: true,
            excessHourPrice: true,
          },
        },
        contractFiles: {
          select: {
            id: true,
            type: true,
            fileId: true,
            file: { select: { originalName: true } },
          },
        },
        billingEntries: {
          orderBy: { monthReference: 'desc' },
          take: 1,
          select: {
            id: true,
            monthReference: true,
            contractedHours: true,
            usedHours: true,
            extraHours: true,
            extraAmount: true,
          },
        },
      },
    });

    const normalizedContracts = contracts.map((c) => {
      const latest = c.billingEntries[0] ?? null;
      const effectiveStatus =
        c.endDate && c.endDate.getTime() < Date.now()
          ? ContractStatus.EXPIRED
          : c.status;
      const specialtyLines = (c.specialties ?? []).map((line) => ({
        monthlyHours: line.monthlyHours,
        unlimited: line.unlimited,
        excessHourPrice: toFinancialNumber(line.excessHourPrice),
      }));
      const monthlyHours = contractedHoursFromContract({
        status: effectiveStatus,
        monthlyHours: c.monthlyHours,
        extraHourPrice: c.extraHourPrice,
        specialties: specialtyLines,
      });
      const extraHourPrice =
        extraHourPriceFromContract({
          status: effectiveStatus,
          monthlyHours: c.monthlyHours,
          extraHourPrice: c.extraHourPrice,
          specialties: specialtyLines,
        }) ?? toFinancialNumber(c.extraHourPrice);

      const usedHours = latest ? toFinancialNumber(latest.usedHours) : 0;
      const extraHours = latest
        ? toFinancialNumber(latest.extraHours)
        : Math.max(0, usedHours - monthlyHours);
      const extraAmount = latest
        ? toFinancialNumber(latest.extraAmount)
        : extraHours * extraHourPrice;

      const contractFile =
        c.contractFiles.find((f) => f.type === ContractFileType.CONTRACT) ??
        null;

      return {
        id: c.id,
        title: c.title,
        status: effectiveStatus,
        monthlyHours,
        extraHourPrice,
        specialties: specialtyLines,
        startDate: c.startDate.toISOString(),
        endDate: c.endDate ? c.endDate.toISOString() : null,
        documentsCount: c.contractFiles.length,
        contractFile: contractFile
          ? {
              fileId: contractFile.fileId,
              originalName: contractFile.file.originalName,
            }
          : null,
        latestBilling: latest
          ? {
              id: latest.id,
              monthReference: latest.monthReference.toISOString(),
              contractedHours: toFinancialNumber(latest.contractedHours),
              usedHours,
              extraHours,
              extraAmount,
            }
          : null,
      };
    });

    const now = new Date();
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
      999,
    );
    const startISO = startMonth.toISOString();
    const endISO = endMonth.toISOString();

    const hoursFromDashboard = await this.dashboard.getDashboardHours(
      user as any,
      {
        group: 'financeiro',
        start: startISO,
        end: endISO,
        companyId: resolvedCompanyId,
      },
    );
    const usedHours = Number(hoursFromDashboard?.summary?.totalHoras ?? 0);
    const totals = computeFinancialOverviewTotals({
      contracts: normalizedContracts,
      usedHours,
    });

    return {
      company: { id: company.id, name: company.name },
      totals,
      contracts: normalizedContracts,
    };
  }

  /** Contratos da empresa para perfis com FINANCIAL (CLIENT, colaborador, etc.). */
  async listContracts(
    user: AuthenticatedRequestUser,
    query: FinancialOverviewQueryDto,
  ) {
    const resolvedCompanyId = await this.resolveCompanyId(
      user,
      query.companyId,
    );

    const company = await this.prisma.company.findFirst({
      where: { id: resolvedCompanyId, deletedAt: null },
      select: { id: true, name: true },
    });

    if (!company) {
      throw new NotFoundException('Empresa não encontrada');
    }

    const contracts = await this.prisma.contract.findMany({
      where: { companyId: company.id, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: {
        specialties: {
          include: {
            specialty: { select: { id: true, name: true, externalId: true } },
          },
          orderBy: { createdAt: 'asc' as const },
        },
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
          orderBy: { id: 'desc' },
        },
        classification: {
          select: {
            id: true,
            name: true,
            level: true,
            specialty: { select: { id: true, name: true } },
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
      },
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

  async downloadContractFile(
    user: AuthenticatedRequestUser,
    query: FinancialOverviewQueryDto,
    contractId: string,
  ) {
    const resolvedCompanyId = await this.resolveCompanyId(
      user,
      query.companyId,
    );

    const contract = await this.prisma.contract.findFirst({
      where: { id: contractId, companyId: resolvedCompanyId, deletedAt: null },
      select: {
        id: true,
        contractFiles: {
          where: { type: ContractFileType.CONTRACT },
          take: 1,
          select: {
            file: {
              select: { originalName: true, mimeType: true, path: true },
            },
          },
        },
      },
    });

    if (!contract) throw new NotFoundException('Contrato não encontrado');
    const file = contract.contractFiles[0]?.file ?? null;
    if (!file)
      throw new NotFoundException('Arquivo do contrato não encontrado');
    if (!existsSync(file.path))
      throw new NotFoundException('Arquivo não encontrado no servidor');

    return {
      file: new StreamableFile(createReadStream(file.path)),
      meta: {
        originalName: file.originalName,
        mimeType: file.mimeType,
      },
    };
  }
}
