import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isClientPortalRole } from '../../common/security/client-portal-role';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedRequestUser } from '../auth/auth-request-user';
import type { DashboardClientViewMode } from './dashboard.types';

const VIEW_MODES = new Set(['ALLE', 'INTERNAL']);
const CHART_TYPES = new Set(['bar', 'line', 'pie']);

export type DashboardChartPresetDto = {
  id: string;
  viewMode: DashboardClientViewMode;
  chartType: string;
  deskNames: string[];
  periodDays: number;
  updatedAt: string;
};

@Injectable()
export class DashboardChartPresetsService {
  constructor(private readonly prisma: PrismaService) {}

  private resolveCompanyId(
    user: AuthenticatedRequestUser,
    companyId?: string,
  ): string {
    if (isClientPortalRole(user.role)) {
      if (!user.companyId) {
        throw new ForbiddenException('Usuário sem empresa vinculada');
      }
      return user.companyId;
    }
    const id = companyId?.trim() || user.companyId;
    if (!id) {
      throw new ForbiddenException('Informe a empresa do preset.');
    }
    return id;
  }

  async getPreset(
    user: AuthenticatedRequestUser,
    viewMode: string,
    companyId?: string,
  ): Promise<DashboardChartPresetDto | null> {
    const mode = this.normalizeViewMode(viewMode);
    const resolvedCompanyId = this.resolveCompanyId(user, companyId);
    const row = await this.prisma.dashboardChartPreset.findUnique({
      where: {
        userId_companyId_viewMode: {
          userId: user.userId,
          companyId: resolvedCompanyId,
          viewMode: mode,
        },
      },
    });
    return row ? this.toDto(row) : null;
  }

  async upsertPreset(
    user: AuthenticatedRequestUser,
    body: {
      viewMode: string;
      chartType?: string;
      deskNames?: string[];
      periodDays?: number;
      companyId?: string;
    },
  ): Promise<DashboardChartPresetDto> {
    const mode = this.normalizeViewMode(body.viewMode);
    const resolvedCompanyId = this.resolveCompanyId(user, body.companyId);
    const chartType = this.normalizeChartType(body.chartType);
    const deskNames = Array.isArray(body.deskNames)
      ? body.deskNames.map((d) => String(d).trim()).filter(Boolean)
      : [];
    const periodDays = this.normalizePeriodDays(body.periodDays);

    const row = await this.prisma.dashboardChartPreset.upsert({
      where: {
        userId_companyId_viewMode: {
          userId: user.userId,
          companyId: resolvedCompanyId,
          viewMode: mode,
        },
      },
      create: {
        userId: user.userId,
        companyId: resolvedCompanyId,
        viewMode: mode,
        chartType,
        deskNames,
        periodDays,
      },
      update: {
        chartType,
        deskNames,
        periodDays,
      },
    });

    return this.toDto(row);
  }

  async deletePreset(
    user: AuthenticatedRequestUser,
    viewMode: string,
    companyId?: string,
  ): Promise<{ ok: true }> {
    const mode = this.normalizeViewMode(viewMode);
    const resolvedCompanyId = this.resolveCompanyId(user, companyId);
    const existing = await this.prisma.dashboardChartPreset.findUnique({
      where: {
        userId_companyId_viewMode: {
          userId: user.userId,
          companyId: resolvedCompanyId,
          viewMode: mode,
        },
      },
    });
    if (!existing) {
      throw new NotFoundException('Preset não encontrado.');
    }
    await this.prisma.dashboardChartPreset.delete({
      where: { id: existing.id },
    });
    return { ok: true };
  }

  private normalizeViewMode(raw: string): DashboardClientViewMode {
    const mode = String(raw ?? 'ALLE')
      .trim()
      .toUpperCase();
    if (!VIEW_MODES.has(mode)) {
      throw new BadRequestException('viewMode inválido (ALLE | INTERNAL).');
    }
    return mode as DashboardClientViewMode;
  }

  private normalizeChartType(raw?: string): string {
    const type = String(raw ?? 'bar')
      .trim()
      .toLowerCase();
    if (!CHART_TYPES.has(type)) {
      return 'bar';
    }
    return type;
  }

  private normalizePeriodDays(raw?: number): number {
    const n = Number(raw ?? 30);
    if (!Number.isFinite(n)) return 30;
    return Math.min(365, Math.max(7, Math.round(n)));
  }

  private toDto(row: {
    id: string;
    viewMode: string;
    chartType: string;
    deskNames: string[];
    periodDays: number;
    updatedAt: Date;
  }): DashboardChartPresetDto {
    return {
      id: row.id,
      viewMode: row.viewMode as DashboardClientViewMode,
      chartType: row.chartType,
      deskNames: row.deskNames ?? [],
      periodDays: row.periodDays,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
