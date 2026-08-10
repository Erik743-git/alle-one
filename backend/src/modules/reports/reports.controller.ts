import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ModulePermissionGuard } from '../auth/guards/module-permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { PermissionModule } from '@prisma/client';
import type { Response } from 'express';
import { ReportsService } from './reports.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedRequestUser } from '../auth/auth-request-user';

@ApiTags('Reports')
@ApiBearerAuth()
@Controller('reports')
@UseGuards(JwtAuthGuard, ModulePermissionGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('companies')
  @RequirePermission(PermissionModule.REPORTS, 'canView')
  listCompanies(@CurrentUser() user: AuthenticatedRequestUser) {
    return this.reports.listCompaniesForReports(user);
  }

  @Get('rendimento-collaborators')
  @RequirePermission(PermissionModule.REPORTS, 'canView')
  listRendimentoCollaborators(@CurrentUser() user: AuthenticatedRequestUser) {
    return this.reports.listRendimentoCollaborators(user);
  }

  @Get()
  @RequirePermission(PermissionModule.REPORTS, 'canView')
  list(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Query('companyId') companyId?: string,
    @Query('type') type?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    return this.reports.listReports(user, { companyId, type, start, end });
  }

  @Get('last')
  @RequirePermission(PermissionModule.REPORTS, 'canView')
  last(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Query('companyId') companyId?: string,
    @Query('type') type?: string,
  ) {
    return this.reports.getLastReport(user, { companyId, type });
  }

  @Post('generate')
  @RequirePermission(PermissionModule.REPORTS, 'canView')
  generate(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Body()
    body: {
      companyId: string;
      type: string;
      format: 'CSV' | 'XLSX';
      start?: string;
      end?: string;
      userId?: string | null;
      companyIds?: string[];
      specialtyIds?: string[];
      onlyExcess?: boolean;
    },
  ) {
    return this.reports.generateReport(user, body);
  }

  @Get('billing-charge')
  @RequirePermission(PermissionModule.REPORTS, 'canView')
  billingCharge(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Query('companyIds') companyIds?: string | string[],
    @Query('specialtyIds') specialtyIds?: string | string[],
    @Query('mode') mode?: string,
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    return this.reports.getBillingChargeReport(user, {
      companyIds,
      specialtyIds,
      mode,
      start,
      end,
    });
  }

  @Get(':id/download')
  @RequirePermission(PermissionModule.REPORTS, 'canView')
  async download(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param('id') reportId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { file, meta } = await this.reports.downloadReport(user, reportId);
    res.setHeader('Content-Type', meta.mimeType || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(meta.originalName)}"`,
    );
    return file;
  }

  // Mantido por compatibilidade: download direto do CSV de horas (antigo).
  @Get('hours-usage.csv')
  @RequirePermission(PermissionModule.REPORTS, 'canView')
  async hoursUsageCsv(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Query('companyId') companyId: string,
    @Res({ passthrough: true }) res: Response,
    @Query('month') month?: string, // legado (YYYY-MM)
  ) {
    // Converte month -> range aproximado: mês atual quando ausente.
    const now = new Date();
    const [y, m] =
      month && /^\d{4}-\d{2}$/.test(month)
        ? month.split('-').map((x) => Number(x))
        : [now.getFullYear(), now.getMonth() + 1];
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 0, 23, 59, 59, 999);

    const csv = await this.reports.generateHoursUsageCsv({
      user,
      companyId,
      start,
      end,
    });
    const filename = `hours-usage-${companyId}-${month ?? 'current'}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return csv;
  }
}
