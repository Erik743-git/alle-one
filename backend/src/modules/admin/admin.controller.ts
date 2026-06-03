import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { PermissionModule } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ModulePermissionGuard } from '../auth/guards/module-permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { AuditMeta } from '../audit/audit.decorator';
import type { AuthenticatedRequestUser } from '../auth/auth-request-user';
import { AdminService } from './admin.service';
import { parseAdminAuditLogsQuery } from './admin-audit.query';
import { ReprocessRendimentoAlertsDto } from './admin-reprocess.dto';
import { RendimentoService } from '../rendimento/rendimento.service';

type AuthenticatedRequest = Request & { user: AuthenticatedRequestUser };

@Controller('admin')
@UseGuards(JwtAuthGuard, ModulePermissionGuard, RolesGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly rendimentoService: RendimentoService,
  ) {}

  @Get('overview-stats')
  @RequirePermission(PermissionModule.ADMIN, 'canView')
  overviewStats() {
    return this.adminService.getOverviewStats();
  }

  @Get('audit-logs')
  @RequirePermission(PermissionModule.ADMIN, 'canView')
  listAuditLogs(@Query() query: Record<string, unknown>) {
    return this.adminService.listAuditLogs(parseAdminAuditLogsQuery(query));
  }

  @Post('reprocess-rendimento-alerts')
  @RequirePermission(PermissionModule.ADMIN, 'canEdit')
  @AuditMeta({
    entity: 'RendimentoDayEvent',
    action: 'REPROCESS',
  })
  reprocessRendimentoAlerts(
    @Req() req: AuthenticatedRequest,
    @Body() body: ReprocessRendimentoAlertsDto,
  ) {
    return this.rendimentoService.reprocessGapAlerts({
      actor: req.user,
      userId: body.userId,
      from: body.from,
      to: body.to,
    });
  }
}
