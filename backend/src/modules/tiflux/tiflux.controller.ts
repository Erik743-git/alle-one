import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PermissionModule } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ModulePermissionGuard } from '../auth/guards/module-permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { TifluxService } from './tiflux.service';

type TifluxRequestDto = {
  path: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: Record<string, unknown>;
};

@Controller('tiflux')
@UseGuards(JwtAuthGuard, ModulePermissionGuard, RolesGuard)
export class TifluxController {
  constructor(private readonly tifluxService: TifluxService) {}

  private assertUnsafeTifluxEndpointsEnabled(): void {
    const enabled = process.env.TIFLUX_UNSAFE_ENDPOINTS === 'true';
    if (!enabled) {
      throw new BadRequestException(
        'Endpoint TiFlux desabilitado por segurança.',
      );
    }
  }

  @Get('test')
  @Roles('ADMIN')
  testConnection() {
    this.assertUnsafeTifluxEndpointsEnabled();
    return this.tifluxService.testConnection();
  }

  @Get('clients')
  @Roles('ADMIN', 'COLLABORATOR', 'PJ')
  @RequirePermission(PermissionModule.COMPANIES, 'canView')
  getClients(
    @Query('active') active?: string,
    @Query('name') name?: string,
    @Query('social_revenue') socialRevenue?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('all') all?: string,
  ) {
    const wantsAll = all === 'true' || all === '1';
    const parsedLimit = limit ? Number(limit) : undefined;
    const parsedOffset = offset ? Number(offset) : undefined;

    if (limit && Number.isNaN(parsedLimit)) {
      throw new BadRequestException('O parâmetro "limit" deve ser numérico.');
    }

    if (offset && Number.isNaN(parsedOffset)) {
      throw new BadRequestException('O parâmetro "offset" deve ser numérico.');
    }

    const activeBool =
      active === undefined ? undefined : active === 'true' || active === '1';

    if (wantsAll) {
      return this.tifluxService.getClientsAll({
        active: activeBool,
        name,
        social_revenue: socialRevenue,
      });
    }

    return this.tifluxService.getClients({
      active: activeBool,
      name,
      social_revenue: socialRevenue,
      limit: parsedLimit,
      offset: parsedOffset,
    });
  }

  @Get('users')
  @Roles('ADMIN')
  @RequirePermission(PermissionModule.USERS, 'canView')
  getUsers(
    @Query('active') active?: string,
    @Query('gauth_enabled') gauthEnabled?: string,
    @Query('type') type?: 'client' | 'attendant' | 'admin',
    @Query('email') email?: string,
    @Query('name') name?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const parsedLimit = limit ? Number(limit) : undefined;
    const parsedOffset = offset ? Number(offset) : undefined;

    if (limit && Number.isNaN(parsedLimit)) {
      throw new BadRequestException('O parâmetro "limit" deve ser numérico.');
    }

    if (offset && Number.isNaN(parsedOffset)) {
      throw new BadRequestException('O parâmetro "offset" deve ser numérico.');
    }

    return this.tifluxService.getUsers({
      active:
        active === undefined ? undefined : active === 'true' || active === '1',
      gauth_enabled:
        gauthEnabled === undefined
          ? undefined
          : gauthEnabled === 'true' || gauthEnabled === '1',
      type,
      email,
      name,
      limit: parsedLimit,
      offset: parsedOffset,
    });
  }

  @Get('tickets')
  @Roles('ADMIN', 'COLLABORATOR', 'PJ', 'CLIENT')
  @RequirePermission(PermissionModule.TICKETS, 'canView')
  getTickets(
    @Query('offset') offset?: string,
    @Query('limit') limit?: string,
    @Query('filter_by') filterBy?: 'open' | 'closed' | 'all',
    @Query('desk_ids') deskIds?: string,
    @Query('client_ids') clientIds?: string,
    @Query('responsible_ids') responsibleIds?: string,
    @Query('status_id') statusId?: string,
    @Query('priority_ids') priorityIds?: string,
    @Query('services_catalogs_item_ids') servicesCatalogsItemIds?: string,
    @Query('stage_ids') stageIds?: string,
    @Query('requestor_ids') requestorIds?: string,
    @Query('requestor_email') requestorEmail?: string,
    @Query('include_filled_entity') includeFilledEntity?: string,
    @Query('has_jira_issue') hasJiraIssue?: string,
    @Query('jira_key') jiraKey?: string,
    @Query('created_by_way_of') createdByWayOf?: string,
    @Query('search') search?: string,
    @Query('date_type') dateType?: 'created_at' | 'solved_in_time',
    @Query('start_datetime') startDatetime?: string,
    @Query('end_datetime') endDatetime?: string,
    @Query('update_start_datetime') updateStartDatetime?: string,
    @Query('update_end_datetime') updateEndDatetime?: string,
  ) {
    const parsedOffset = offset ? Number(offset) : undefined;
    const parsedLimit = limit ? Number(limit) : undefined;
    const parsedStatusId = statusId ? Number(statusId) : undefined;
    const parsedCreatedByWayOf = createdByWayOf
      ? Number(createdByWayOf)
      : undefined;

    if (offset && Number.isNaN(parsedOffset)) {
      throw new BadRequestException('O parâmetro "offset" deve ser numérico.');
    }

    if (limit && Number.isNaN(parsedLimit)) {
      throw new BadRequestException('O parâmetro "limit" deve ser numérico.');
    }

    if (statusId && Number.isNaN(parsedStatusId)) {
      throw new BadRequestException(
        'O parâmetro "status_id" deve ser numérico.',
      );
    }

    if (createdByWayOf && Number.isNaN(parsedCreatedByWayOf)) {
      throw new BadRequestException(
        'O parâmetro "created_by_way_of" deve ser numérico.',
      );
    }

    const parseIds = (value?: string) =>
      value
        ? value
            .split(',')
            .map((item) => Number(item.trim()))
            .filter((item) => !Number.isNaN(item))
        : undefined;

    return this.tifluxService.getTickets({
      offset: parsedOffset,
      limit: parsedLimit,
      filter_by: filterBy,
      desk_ids: parseIds(deskIds),
      client_ids: parseIds(clientIds),
      responsible_ids: parseIds(responsibleIds),
      status_id: parsedStatusId,
      priority_ids: parseIds(priorityIds),
      services_catalogs_item_ids: parseIds(servicesCatalogsItemIds),
      stage_ids: parseIds(stageIds),
      requestor_ids: parseIds(requestorIds),
      requestor_email: requestorEmail,
      include_filled_entity:
        includeFilledEntity === undefined
          ? undefined
          : includeFilledEntity === 'true' || includeFilledEntity === '1',
      has_jira_issue:
        hasJiraIssue === undefined
          ? undefined
          : hasJiraIssue === 'true' || hasJiraIssue === '1',
      jira_key: jiraKey,
      created_by_way_of: parsedCreatedByWayOf,
      search,
      date_type: dateType,
      start_datetime: startDatetime,
      end_datetime: endDatetime,
      update_start_datetime: updateStartDatetime,
      update_end_datetime: updateEndDatetime,
    });
  }

  @Get('request')
  @Roles('ADMIN')
  requestByQuery(
    @Query('path') path: string,
    @Query('method') method?: 'GET' | 'POST' | 'PUT' | 'DELETE',
  ) {
    this.assertUnsafeTifluxEndpointsEnabled();
    if (!path?.trim()) {
      throw new BadRequestException('O parâmetro "path" é obrigatório.');
    }

    return this.tifluxService.requestResource(path, method ?? 'GET');
  }

  @Post('request')
  @Roles('ADMIN')
  requestByBody(@Body() data: TifluxRequestDto) {
    this.assertUnsafeTifluxEndpointsEnabled();
    if (!data.path?.trim()) {
      throw new BadRequestException('O campo "path" é obrigatório.');
    }

    return this.tifluxService.requestResource(
      data.path,
      data.method ?? 'GET',
      data.body,
    );
  }
}
