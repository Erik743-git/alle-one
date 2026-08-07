import {
  Body,
  Controller,
  Delete,
  Get,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { PermissionModule } from '@prisma/client';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ModulePermissionGuard } from '../auth/guards/module-permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import type { AuthenticatedRequestUser } from '../auth/auth-request-user';
import { DashboardChartPresetsService } from './dashboard-chart-presets.service';
import {
  ChartPresetQueryDto,
  UpsertDashboardChartPresetDto,
} from './dto/upsert-chart-preset.dto';

type AuthenticatedRequest = Request & {
  user: AuthenticatedRequestUser;
};

@Controller('dashboard/chart-presets')
@UseGuards(JwtAuthGuard, ModulePermissionGuard)
export class DashboardChartPresetsController {
  constructor(private readonly presets: DashboardChartPresetsService) {}

  @Get()
  @RequirePermission(PermissionModule.DASHBOARD, 'canView')
  getPreset(
    @Req() req: AuthenticatedRequest,
    @Query() query: ChartPresetQueryDto,
  ) {
    return this.presets.getPreset(
      req.user,
      query.viewMode,
      query.chartKey,
      query.companyId,
    );
  }

  @Put()
  @RequirePermission(PermissionModule.DASHBOARD, 'canView')
  upsertPreset(
    @Req() req: AuthenticatedRequest,
    @Body() body: UpsertDashboardChartPresetDto,
  ) {
    return this.presets.upsertPreset(req.user, body);
  }

  @Delete()
  @RequirePermission(PermissionModule.DASHBOARD, 'canView')
  deletePreset(
    @Req() req: AuthenticatedRequest,
    @Query() query: ChartPresetQueryDto,
  ) {
    return this.presets.deletePreset(
      req.user,
      query.viewMode,
      query.chartKey,
      query.companyId,
    );
  }
}
