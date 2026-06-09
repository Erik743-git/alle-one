import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
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
import { DeskClassificationService } from './desk-classification.service';
import {
  CreateDeskClassificationDto,
  CreateServiceDeskDto,
  UpdateDeskClassificationDto,
  UpdateServiceDeskDto,
} from './desk-classification.dto';

type AuthenticatedRequest = Request & { user: AuthenticatedRequestUser };

@Controller('admin')
@UseGuards(JwtAuthGuard, ModulePermissionGuard, RolesGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly rendimentoService: RendimentoService,
    private readonly deskClassificationService: DeskClassificationService,
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

  @Get('classifications/desks')
  @RequirePermission(PermissionModule.ADMIN, 'canView')
  listClassificationDesks() {
    return this.deskClassificationService.listDesks();
  }

  @Post('classifications/desks')
  @RequirePermission(PermissionModule.ADMIN, 'canEdit')
  @AuditMeta({
    entity: 'ServiceDesk',
    action: 'CREATE',
  })
  createClassificationDesk(@Body() body: CreateServiceDeskDto) {
    return this.deskClassificationService.createDesk(body);
  }

  @Patch('classifications/desks/:deskId')
  @RequirePermission(PermissionModule.ADMIN, 'canEdit')
  @AuditMeta({
    entity: 'ServiceDesk',
    action: 'UPDATE',
  })
  updateClassificationDesk(
    @Param('deskId') deskId: string,
    @Body() body: UpdateServiceDeskDto,
  ) {
    return this.deskClassificationService.updateDesk(deskId, body);
  }

  @Delete('classifications/desks/:deskId')
  @RequirePermission(PermissionModule.ADMIN, 'canEdit')
  @AuditMeta({
    entity: 'ServiceDesk',
    action: 'DELETE',
  })
  deleteClassificationDesk(@Param('deskId') deskId: string) {
    return this.deskClassificationService.removeDesk(deskId);
  }

  @Get('classifications')
  @RequirePermission(PermissionModule.ADMIN, 'canView')
  getClassificationTree(@Query('serviceDeskId') serviceDeskId: string) {
    return this.deskClassificationService.getTree(serviceDeskId);
  }

  @Post('classifications')
  @RequirePermission(PermissionModule.ADMIN, 'canEdit')
  @AuditMeta({
    entity: 'ServiceDeskClassification',
    action: 'CREATE',
  })
  createClassification(@Body() body: CreateDeskClassificationDto) {
    return this.deskClassificationService.create(body);
  }

  @Patch('classifications/:id')
  @RequirePermission(PermissionModule.ADMIN, 'canEdit')
  @AuditMeta({
    entity: 'ServiceDeskClassification',
    action: 'UPDATE',
  })
  updateClassification(
    @Param('id') id: string,
    @Body() body: UpdateDeskClassificationDto,
  ) {
    return this.deskClassificationService.update(id, body);
  }

  @Delete('classifications/:id')
  @RequirePermission(PermissionModule.ADMIN, 'canEdit')
  @AuditMeta({
    entity: 'ServiceDeskClassification',
    action: 'DELETE',
  })
  deleteClassification(@Param('id') id: string) {
    return this.deskClassificationService.remove(id);
  }
}
