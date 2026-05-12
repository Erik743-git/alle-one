import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ModulePermissionGuard } from '../auth/guards/module-permission.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { PermissionModule } from '@prisma/client';
import { UpsertUsageAlertRuleDto } from './usage-alerts.dto';
import { UsageAlertsService } from './usage-alerts.service';

@ApiTags('UsageAlerts')
@ApiBearerAuth()
@Controller('usage-alerts')
@UseGuards(JwtAuthGuard, ModulePermissionGuard, RolesGuard)
export class UsageAlertsController {
  constructor(private readonly service: UsageAlertsService) {}

  @Get()
  @Roles('ADMIN')
  @RequirePermission(PermissionModule.FINANCIAL, 'canView')
  list() {
    return this.service.list();
  }

  @Post()
  @Roles('ADMIN')
  @RequirePermission(PermissionModule.FINANCIAL, 'canEdit')
  upsert(@Body() dto: UpsertUsageAlertRuleDto) {
    return this.service.upsert({
      companyId: dto.companyId,
      enabled: dto.enabled,
      dayOfMonth: dto.dayOfMonth,
      lowThresholdPct: dto.lowThresholdPct ?? null,
      highThresholdPct: dto.highThresholdPct ?? null,
      to: dto.to,
      cc: dto.cc,
    });
  }
}
