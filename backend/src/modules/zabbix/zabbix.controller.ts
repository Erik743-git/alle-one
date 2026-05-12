import {
  BadRequestException,
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PermissionModule } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ModulePermissionGuard } from '../auth/guards/module-permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { ZabbixService } from './zabbix.service';

@Controller('zabbix')
@UseGuards(JwtAuthGuard, ModulePermissionGuard, RolesGuard)
@Roles('ADMIN', 'COLLABORATOR', 'CLIENT')
export class ZabbixController {
  constructor(private readonly service: ZabbixService) {}

  @Get('groups')
  @RequirePermission(PermissionModule.MONITORING, 'canView')
  getGroups() {
    return this.service.getGroups();
  }

  @Get('hosts')
  @RequirePermission(PermissionModule.MONITORING, 'canView')
  getHosts() {
    return this.service.getHosts();
  }

  @Get('hosts-by-company')
  @RequirePermission(PermissionModule.MONITORING, 'canView')
  getByCompany(@Query('group') group: string) {
    if (!group?.trim()) {
      throw new BadRequestException('O parâmetro "group" é obrigatório.');
    }

    return this.service.getHostsByGroup(group);
  }

  @Get('hosts-by-group-detailed')
  @RequirePermission(PermissionModule.MONITORING, 'canView')
  getHostsDetailedByGroup(@Query('group') group: string) {
    if (!group?.trim()) {
      throw new BadRequestException('O parâmetro "group" é obrigatório.');
    }

    return this.service.getHostsDetailedByGroup(group);
  }

  @Get('templates-by-group')
  @RequirePermission(PermissionModule.MONITORING, 'canView')
  getTemplatesByGroup(@Query('group') group: string) {
    if (!group?.trim()) {
      throw new BadRequestException('O parâmetro "group" é obrigatório.');
    }

    return this.service.getTemplatesByGroup(group);
  }

  @Get('events-by-group')
  @RequirePermission(PermissionModule.MONITORING, 'canView')
  getEventsByGroup(
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

    return this.service.getEventsByGroup(group, parsedDays);
  }

  @Get('problems')
  @RequirePermission(PermissionModule.MONITORING, 'canView')
  getProblems() {
    return this.service.getProblems();
  }

  @Get('overview')
  @RequirePermission(PermissionModule.MONITORING, 'canView')
  getOverview(@Query('group') group: string) {
    if (!group?.trim()) {
      throw new BadRequestException('O parâmetro "group" é obrigatório.');
    }

    return this.service.getOverviewByGroup(group);
  }

  @Get('dashboard-details')
  @RequirePermission(PermissionModule.MONITORING, 'canView')
  getDashboardDetails(
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

    return this.service.getDashboardDetailsByGroup(group, parsedDays);
  }

  @Get('host-items-summary')
  @RequirePermission(PermissionModule.MONITORING, 'canView')
  getHostItemsSummary(@Query('hostid') hostid: string) {
    if (!hostid?.trim()) {
      throw new BadRequestException('O parâmetro "hostid" é obrigatório.');
    }
    return this.service.getHostItemsSummary(hostid);
  }
}
