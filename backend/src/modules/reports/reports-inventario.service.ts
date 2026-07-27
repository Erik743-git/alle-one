import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  buildInventarioReportCsv,
  buildInventarioReportXlsx,
  type InventarioReportRow,
} from './reports-inventario';

export const ALL_COMPANIES_REPORT_ID = '__all__';

@Injectable()
export class ReportsInventarioService {
  constructor(private readonly prisma: PrismaService) {}

  startOfDay(date = new Date()) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  async resolveScope(
    scopeCompanyIds: string[],
    payload: { companyId?: string; companyIds?: string[] },
  ) {
    const companyId = payload.companyId?.trim() || '';

    if (companyId === ALL_COMPANIES_REPORT_ID) {
      const companies = await this.prisma.company.findMany({
        where: { id: { in: scopeCompanyIds }, deletedAt: null },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      });
      return {
        companyIds: companies.map((c) => c.id),
        scopeLabel: 'Todas as empresas',
        allCompanies: true,
        representativeCompanyId: companies[0]?.id ?? '',
        logoCompanyId: companies.find((c) =>
          c.name.trim().toLowerCase().includes('alle'),
        )?.id,
      };
    }

    const rawIds =
      payload.companyIds?.length && payload.companyIds.length > 0
        ? payload.companyIds
        : companyId
          ? [companyId]
          : [];
    const unique = [...new Set(rawIds.map((id) => id.trim()).filter(Boolean))];
    if (!unique.length) {
      throw new BadRequestException('Selecione ao menos uma empresa.');
    }
    for (const id of unique) {
      if (!scopeCompanyIds.includes(id)) {
        throw new ForbiddenException('Sem acesso à empresa informada');
      }
    }

    const companies = await this.prisma.company.findMany({
      where: { id: { in: unique }, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    if (companies.length !== unique.length) {
      throw new BadRequestException('Empresa inválida.');
    }

    return {
      companyIds: companies.map((c) => c.id),
      scopeLabel:
        companies.length === 1
          ? companies[0].name
          : `${companies.length} empresas selecionadas`,
      allCompanies: companies.length === scopeCompanyIds.length,
      representativeCompanyId: companies[0].id,
      logoCompanyId: companies.length === 1 ? companies[0].id : undefined,
    };
  }

  async generateCsv(params: {
    companyIds: string[];
    scopeLabel: string;
    generatedAt: Date;
  }) {
    const rows = await this.loadRows(params.companyIds);
    return buildInventarioReportCsv({
      scopeLabel: params.scopeLabel,
      generatedAt: params.generatedAt,
      rows,
      multiCompany: params.companyIds.length > 1,
    });
  }

  async generateXlsx(params: {
    companyIds: string[];
    scopeLabel: string;
    generatedAt: Date;
    logoCompanyId?: string;
  }) {
    let logoPath: string | null = null;
    let logoMimeType: string | null = null;
    if (params.logoCompanyId) {
      const company = await this.prisma.company.findFirst({
        where: { id: params.logoCompanyId, deletedAt: null },
        select: { logoFile: { select: { path: true, mimeType: true } } },
      });
      logoPath = company?.logoFile?.path ?? null;
      logoMimeType = company?.logoFile?.mimeType ?? null;
    }

    const rows = await this.loadRows(params.companyIds);
    return buildInventarioReportXlsx({
      scopeLabel: params.scopeLabel,
      generatedAt: params.generatedAt,
      rows,
      multiCompany: params.companyIds.length > 1,
      logoPath,
      logoMimeType,
    });
  }

  private async loadRows(companyIds: string[]): Promise<InventarioReportRow[]> {
    const today = this.startOfDay();
    const multiCompany = companyIds.length > 1;
    const rows = await this.prisma.inventoryAsset.findMany({
      where: { companyId: { in: companyIds }, deletedAt: null },
      include: {
        assetType: { select: { name: true } },
        company: { select: { name: true } },
      },
      orderBy: multiCompany
        ? [
            { company: { name: 'asc' } },
            { assetType: { name: 'asc' } },
            { brand: 'asc' },
            { name: 'asc' },
          ]
        : [
            { assetType: { name: 'asc' } },
            { brand: 'asc' },
            { name: 'asc' },
          ],
    });

    return rows.map((row) => ({
      ...(multiCompany ? { companyName: row.company.name } : {}),
      assetTypeName: row.assetType.name,
      brand: row.brand,
      quantity: row.quantity,
      supplier: row.supplier,
      supplierThirdParty: row.supplierThirdParty,
      description: row.description,
      dueDate: row.dueDate ? row.dueDate.toISOString().slice(0, 10) : null,
      reminderDaysBefore: row.reminderDaysBefore,
      overdue: row.dueDate
        ? this.startOfDay(row.dueDate).getTime() < today.getTime()
        : false,
    }));
  }
}
