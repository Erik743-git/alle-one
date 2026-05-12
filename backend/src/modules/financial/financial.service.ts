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
import { TifluxService } from '../tiflux/tiflux.service';
import { DashboardService } from '../dashboard/dashboard.service';

function toNumber(value: unknown) {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const n = Number(value);
    return Number.isNaN(n) ? 0 : n;
  }
  // Prisma Decimal -> has toNumber()
  if (typeof value === 'object' && value && 'toNumber' in value) {
    const fn = (value as { toNumber?: () => number }).toNumber;
    if (typeof fn === 'function') return fn();
  }
  return 0;
}

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
    if (user.role === 'CLIENT') {
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
      const contractedHours = latest
        ? toNumber(latest.contractedHours)
        : c.monthlyHours;
      const usedHours = latest ? toNumber(latest.usedHours) : 0;
      const extraHours = latest
        ? toNumber(latest.extraHours)
        : Math.max(0, usedHours - contractedHours);
      const extraAmount = latest ? toNumber(latest.extraAmount) : 0;

      const contractFile =
        c.contractFiles.find((f) => f.type === ContractFileType.CONTRACT) ??
        null;
      const effectiveStatus =
        c.endDate && c.endDate.getTime() < Date.now()
          ? ContractStatus.EXPIRED
          : c.status;

      return {
        id: c.id,
        title: c.title,
        status: effectiveStatus,
        monthlyHours: c.monthlyHours,
        extraHourPrice: toNumber(c.extraHourPrice),
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
              contractedHours,
              usedHours,
              extraHours,
              extraAmount,
            }
          : null,
      };
    });

    const totalsFromContracts = normalizedContracts.reduce(
      (acc, c) => {
        const contracted = c.latestBilling?.contractedHours ?? c.monthlyHours;
        const used = c.latestBilling?.usedHours ?? 0;
        const extra =
          c.latestBilling?.extraHours ?? Math.max(0, used - contracted);
        const extraAmount = c.latestBilling?.extraAmount ?? 0;
        return {
          contractedHours: acc.contractedHours + contracted,
          usedHours: acc.usedHours + used,
          extraHours: acc.extraHours + extra,
          extraAmount: acc.extraAmount + extraAmount,
        };
      },
      { contractedHours: 0, usedHours: 0, extraHours: 0, extraAmount: 0 },
    );

    const now = new Date();
    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
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
    const tifluxUsedHoursThisMonth = Number(
      hoursFromDashboard?.summary?.totalHoras ?? 0,
    );
    const contractedHours = totalsFromContracts.contractedHours;
    const usedHours = tifluxUsedHoursThisMonth;
    const extraHours = Math.max(0, usedHours - contractedHours);
    const extraHourPrice =
      normalizedContracts.filter((c) => c.status === ContractStatus.ACTIVE)
        .length === 1
        ? normalizedContracts.filter(
            (c) => c.status === ContractStatus.ACTIVE,
          )[0].extraHourPrice
        : 0;
    const extraAmount = extraHours * extraHourPrice;

    return {
      company: { id: company.id, name: company.name },
      totals: {
        contractedHours,
        usedHours,
        extraHours,
        extraAmount,
      },
      contracts: normalizedContracts,
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
