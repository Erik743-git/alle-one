import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { PermissionModule } from '@prisma/client';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AuditMeta } from '../audit/audit.decorator';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ModulePermissionGuard } from '../auth/guards/module-permission.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedRequestUser } from '../auth/auth-request-user';
import {
  ConsoleAcknowledgeDto,
  ConsoleAlertsQueryDto,
  ConsoleEventIdParamDto,
  ConsoleHostIdParamDto,
  ConsoleHostItemsQueryDto,
  ConsoleHostsQueryDto,
} from './console.dto';
import { ConsoleService } from './console.service';

type AuthenticatedRequest = Request & { user: AuthenticatedRequestUser };

@ApiTags('Console')
@ApiBearerAuth()
@Controller('console')
@UseGuards(JwtAuthGuard, ModulePermissionGuard, RolesGuard)
@Roles('ADMIN', 'COLLABORATOR', 'PJ', 'CLIENT')
export class ConsoleController {
  constructor(private readonly consoleService: ConsoleService) {}

  @Get('groups')
  @RequirePermission(PermissionModule.MONITORING, 'canView')
  listGroups(@Req() req: AuthenticatedRequest) {
    return this.consoleService.listGroups(req.user);
  }

  @Get('alerts')
  @RequirePermission(PermissionModule.MONITORING, 'canView')
  listAlerts(
    @Req() req: AuthenticatedRequest,
    @Query() query: ConsoleAlertsQueryDto,
  ) {
    return this.consoleService.listAlerts(req.user, query);
  }

  @Get('hosts')
  @RequirePermission(PermissionModule.MONITORING, 'canView')
  listHosts(
    @Req() req: AuthenticatedRequest,
    @Query() query: ConsoleHostsQueryDto,
  ) {
    return this.consoleService.listHosts(req.user, query);
  }

  @Get('host/:hostid/items')
  @RequirePermission(PermissionModule.MONITORING, 'canView')
  getHostItems(
    @Req() req: AuthenticatedRequest,
    @Param() params: ConsoleHostIdParamDto,
    @Query() query: ConsoleHostItemsQueryDto,
  ) {
    return this.consoleService.getHostItems(req.user, params.hostid, query);
  }

  @Post('alerts/:eventid/ack')
  @RequirePermission(PermissionModule.MONITORING, 'canEdit')
  @AuditMeta({ entity: 'ZabbixAlert', action: 'UPDATE', entityIdParam: 'eventid' })
  acknowledgeAlert(
    @Req() req: AuthenticatedRequest,
    @Param() params: ConsoleEventIdParamDto,
    @Body() body: ConsoleAcknowledgeDto,
  ) {
    return this.consoleService.acknowledgeAlert(
      req.user,
      params.eventid,
      body,
    );
  }
}
