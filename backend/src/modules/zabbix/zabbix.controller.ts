import {
  BadRequestException,
  Controller,
  Get,
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
import type { AuthenticatedRequestUser } from '../auth/auth-request-user';
import { TenantScopeService } from '../../common/security/tenant-scope.service';
import { ZabbixService } from './zabbix.service';
import { parseZabbixGroupNames } from '../companies/zabbix-groups.util';

type AuthenticatedRequest = Request & { user: AuthenticatedRequestUser };

@Controller('zabbix')
@UseGuards(JwtAuthGuard, ModulePermissionGuard, RolesGuard)
@Roles('ADMIN', 'COLLABORATOR', 'PJ', 'CLIENT')
export class ZabbixController {
  constructor(
    private readonly service: ZabbixService,
    private readonly tenantScope: TenantScopeService,
  ) {}

  @Get('groups')
  @RequirePermission(PermissionModule.MONITORING, 'canView')
  async getGroups(@Req() req: AuthenticatedRequest) {
    const clientGroup = await this.tenantScope.resolveZabbixGroupForList(
      req.user,
    );
    if (clientGroup) {
      return parseZabbixGroupNames(clientGroup).map((name) => ({ name }));
    }
    return this.service.getGroups();
  }

  @Get('hosts')
  @RequirePermission(PermissionModule.MONITORING, 'canView')
  async getHosts(@Req() req: AuthenticatedRequest) {
    const clientGroup = await this.tenantScope.resolveZabbixGroupForList(
      req.user,
    );
    if (clientGroup) {
      return this.service.getHostsByGroup(clientGroup);
    }
    return this.service.getHosts();
  }

  @Get('hosts-by-company')
  @RequirePermission(PermissionModule.MONITORING, 'canView')
  async getByCompany(
    @Req() req: AuthenticatedRequest,
    @Query('group') group: string,
  ) {
    if (!group?.trim()) {
      throw new BadRequestException('O parâmetro "group" é obrigatório.');
    }

    const scopedGroup = await this.tenantScope.assertZabbixGroupAccess(
      req.user,
      group,
    );
    return this.service.getHostsByGroup(scopedGroup);
  }

  @Get('hosts-by-group-detailed')
  @RequirePermission(PermissionModule.MONITORING, 'canView')
  async getHostsDetailedByGroup(
    @Req() req: AuthenticatedRequest,
    @Query('group') group: string,
  ) {
    if (!group?.trim()) {
      throw new BadRequestException('O parâmetro "group" é obrigatório.');
    }

    const scopedGroup = await this.tenantScope.assertZabbixGroupAccess(
      req.user,
      group,
    );
    return this.service.getHostsDetailedByGroup(scopedGroup);
  }

  @Get('templates-by-group')
  @RequirePermission(PermissionModule.MONITORING, 'canView')
  async getTemplatesByGroup(
    @Req() req: AuthenticatedRequest,
    @Query('group') group: string,
  ) {
    if (!group?.trim()) {
      throw new BadRequestException('O parâmetro "group" é obrigatório.');
    }

    const scopedGroup = await this.tenantScope.assertZabbixGroupAccess(
      req.user,
      group,
    );
    return this.service.getTemplatesByGroup(scopedGroup);
  }

  @Get('events-by-group')
  @RequirePermission(PermissionModule.MONITORING, 'canView')
  async getEventsByGroup(
    @Req() req: AuthenticatedRequest,
    @Query('group') group: string,
    @Query('days') days?: string,
  ) {
    if (!group?.trim()) {
      throw new BadRequestException('O parâmetro "group" é obrigatório.');
    }

    const parsedDays = days ? Number(days) : 7;

    if (Number.isNaN(parsedDays) || parsedDays <= 0) {
      throw new BadRequestException(
        'O parâmetro "days" deve ser um número maior que zero.',
      );
    }

    const scopedGroup = await this.tenantScope.assertZabbixGroupAccess(
      req.user,
      group,
    );
    return this.service.getEventsByGroup(scopedGroup, parsedDays);
  }

  @Get('problems')
  @RequirePermission(PermissionModule.MONITORING, 'canView')
  async getProblems(@Req() req: AuthenticatedRequest) {
    const clientGroup = await this.tenantScope.resolveZabbixGroupForList(
      req.user,
    );
    if (clientGroup) {
      return this.service.getOverviewByGroup(clientGroup);
    }
    return this.service.getProblems();
  }

  @Get('overview')
  @RequirePermission(PermissionModule.MONITORING, 'canView')
  async getOverview(
    @Req() req: AuthenticatedRequest,
    @Query('group') group: string,
  ) {
    if (!group?.trim()) {
      throw new BadRequestException('O parâmetro "group" é obrigatório.');
    }

    const scopedGroup = await this.tenantScope.assertZabbixGroupAccess(
      req.user,
      group,
    );
    return this.service.getOverviewByGroup(scopedGroup);
  }

  @Get('dashboard-details')
  @RequirePermission(PermissionModule.MONITORING, 'canView')
  async getDashboardDetails(
    @Req() req: AuthenticatedRequest,
    @Query('group') group: string,
    @Query('days') days?: string,
  ) {
    if (!group?.trim()) {
      throw new BadRequestException('O parâmetro "group" é obrigatório.');
    }

    const parsedDays = days ? Number(days) : 7;

    if (Number.isNaN(parsedDays) || parsedDays <= 0) {
      throw new BadRequestException(
        'O parâmetro "days" deve ser um número maior que zero.',
      );
    }

    const scopedGroup = await this.tenantScope.assertZabbixGroupAccess(
      req.user,
      group,
    );
    return this.service.getDashboardDetailsByGroup(scopedGroup, parsedDays);
  }

  @Get('host-items-summary')
  @RequirePermission(PermissionModule.MONITORING, 'canView')
  async getHostItemsSummary(
    @Req() req: AuthenticatedRequest,
    @Query('hostid') hostid: string,
    @Query('group') group?: string,
  ) {
    if (!hostid?.trim()) {
      throw new BadRequestException('O parâmetro "hostid" é obrigatório.');
    }

    if (req.user.role === 'CLIENT') {
      if (!group?.trim()) {
        throw new BadRequestException(
          'O parâmetro "group" é obrigatório para clientes.',
        );
      }
      const scopedGroup = await this.tenantScope.assertZabbixGroupAccess(
        req.user,
        group,
      );
      return this.service.getHostItemsSummaryForGroup(scopedGroup, hostid);
    }

    if (group?.trim()) {
      return this.service.getHostItemsSummaryForGroup(group, hostid);
    }

    return this.service.getHostItemsSummary(hostid);
  }
}
