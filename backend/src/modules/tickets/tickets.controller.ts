import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PermissionModule } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ticketAppointmentUploadLimits } from '../../common/upload.config';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedRequestUser } from '../auth/auth-request-user';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ModulePermissionGuard } from '../auth/guards/module-permission.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  CreateTicketAppointmentDto,
  CreateTicketDto,
  UpdateTicketAppointmentDto,
  UpdateTicketDto,
} from './tickets-create.dto';
import {
  SearchTicketUsersQueryDto,
  TicketsListQueryDto,
  UpdateTicketStageDto,
} from './tickets.dto';
import { LinkTicketGmudDto } from './tickets-gmud.dto';
import { TicketsAppointmentsService } from './tickets-appointments.service';
import { TicketsReconcileService } from './tickets-reconcile.service';
import { TicketsCatalogsService } from './tickets-catalogs.service';
import { TicketsQueryService } from './tickets-query.service';
import { TicketsService } from './tickets.service';

@ApiTags('Tickets')
@ApiBearerAuth()
@Controller('tickets')
@UseGuards(JwtAuthGuard, ModulePermissionGuard, RolesGuard)
export class TicketsController {
  constructor(
    private readonly ticketsService: TicketsService,
    private readonly ticketsQueryService: TicketsQueryService,
    private readonly catalogsService: TicketsCatalogsService,
    private readonly appointmentsService: TicketsAppointmentsService,
    private readonly reconcileService: TicketsReconcileService,
  ) {}

  @Get()
  @Roles('ADMIN', 'COLLABORATOR', 'PJ', 'CLIENT')
  @RequirePermission(PermissionModule.TICKETS, 'canView')
  list(
    @CurrentUser() actor: AuthenticatedRequestUser,
    @Query() query: TicketsListQueryDto,
  ) {
    return this.ticketsQueryService.listGrouped(actor, query);
  }

  @Get('catalogs/filters')
  @Roles('ADMIN', 'COLLABORATOR', 'PJ', 'CLIENT')
  @RequirePermission(PermissionModule.TICKETS, 'canView')
  filterCatalogs(@CurrentUser() actor: AuthenticatedRequestUser) {
    return this.catalogsService.getFilterCatalogs(actor);
  }

  @Get('catalogs/create')
  @Roles('ADMIN', 'COLLABORATOR', 'PJ', 'CLIENT')
  @RequirePermission(PermissionModule.TICKETS, 'canCreate')
  createCatalogs(
    @Query('deskId') deskIdRaw?: string,
    @Query('clientId') clientIdRaw?: string,
  ) {
    const deskId =
      deskIdRaw != null && deskIdRaw.trim() !== ''
        ? Number(deskIdRaw)
        : undefined;
    const clientId =
      clientIdRaw != null && clientIdRaw.trim() !== ''
        ? Number(clientIdRaw)
        : undefined;
    return this.catalogsService.getCreateCatalogs(
      deskId != null && Number.isFinite(deskId) ? deskId : undefined,
      clientId != null && Number.isFinite(clientId) ? clientId : undefined,
    );
  }

  @Get('users/search')
  @Roles('ADMIN', 'COLLABORATOR', 'PJ')
  @RequirePermission(PermissionModule.TICKETS, 'canCreate')
  searchUsers(@Query() query: SearchTicketUsersQueryDto) {
    return this.ticketsService.searchUsersForCc(query.q);
  }

  @Get('attachments/:fileId')
  @Roles('ADMIN', 'COLLABORATOR', 'PJ', 'CLIENT')
  @RequirePermission(PermissionModule.TICKETS, 'canView')
  async downloadAttachment(
    @CurrentUser() actor: AuthenticatedRequestUser,
    @Param('fileId') fileId: string,
    @Query('inline') inline?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const { stream, meta } =
      await this.appointmentsService.downloadPortalAttachment(
        actor,
        fileId,
        inline === 'true',
      );
    res?.setHeader('Content-Type', meta.mimeType || 'application/octet-stream');
    res?.setHeader(
      'Content-Disposition',
      `${meta.inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(meta.originalName)}"`,
    );
    return stream;
  }

  @Post('reconcile')
  @Roles('ADMIN')
  @RequirePermission(PermissionModule.TICKETS, 'canEdit')
  reconcile(@Query('retry') retry?: string) {
    return this.reconcileService.reconcile({
      autoRetry: retry === 'true' || retry === '1',
    });
  }

  @Post()
  @Roles('ADMIN', 'COLLABORATOR', 'PJ', 'CLIENT')
  @RequirePermission(PermissionModule.TICKETS, 'canCreate')
  @UseInterceptors(FilesInterceptor('files', 10, ticketAppointmentUploadLimits))
  async create(
    @CurrentUser() actor: AuthenticatedRequestUser,
    @Body('payload') payloadRaw: string,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    if (!payloadRaw?.trim()) {
      throw new BadRequestException('Campo payload é obrigatório.');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(payloadRaw);
    } catch {
      throw new BadRequestException('Payload JSON inválido.');
    }

    const dto = plainToInstance(CreateTicketDto, parsed);
    const errors = await validate(dto);
    if (errors.length > 0) {
      const first = errors[0];
      const msg =
        Object.values(first.constraints ?? {})[0] ??
        'Dados do chamado inválidos.';
      throw new BadRequestException(msg);
    }

    return this.ticketsService.createTicket(actor, dto, files ?? []);
  }

  @Get(':ticketNumber/catalogs/appointment')
  @Roles('ADMIN', 'COLLABORATOR', 'PJ')
  @RequirePermission(PermissionModule.TICKETS, 'canCreate')
  appointmentCatalogs(
    @Param('ticketNumber', ParseIntPipe) ticketNumber: number,
  ) {
    return this.appointmentsService.getAppointmentCatalogs(ticketNumber);
  }

  @Get(':ticketNumber/stages')
  @Roles('ADMIN', 'COLLABORATOR', 'PJ', 'CLIENT')
  @RequirePermission(PermissionModule.TICKETS, 'canView')
  listStages(
    @CurrentUser() actor: AuthenticatedRequestUser,
    @Param('ticketNumber', ParseIntPipe) ticketNumber: number,
  ) {
    return this.ticketsQueryService.listTicketStages(actor, ticketNumber);
  }

  @Patch(':ticketNumber/stage')
  @Roles('ADMIN', 'COLLABORATOR', 'PJ')
  @RequirePermission(PermissionModule.TICKETS, 'canCreate')
  updateStage(
    @CurrentUser() actor: AuthenticatedRequestUser,
    @Param('ticketNumber', ParseIntPipe) ticketNumber: number,
    @Body() body: UpdateTicketStageDto,
  ) {
    return this.ticketsQueryService.updateTicketStage(
      actor,
      ticketNumber,
      body.stageId,
    );
  }

  @Patch(':ticketNumber')
  @Roles('ADMIN', 'COLLABORATOR', 'PJ')
  @RequirePermission(PermissionModule.TICKETS, 'canCreate')
  @UseInterceptors(FilesInterceptor('files', 10, ticketAppointmentUploadLimits))
  async updateTicket(
    @CurrentUser() actor: AuthenticatedRequestUser,
    @Param('ticketNumber', ParseIntPipe) ticketNumber: number,
    @Body('payload') payloadRaw: string,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    if (!payloadRaw?.trim()) {
      throw new BadRequestException('Campo payload é obrigatório.');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(payloadRaw);
    } catch {
      throw new BadRequestException('Payload JSON inválido.');
    }

    const dto = plainToInstance(UpdateTicketDto, parsed);
    const errors = await validate(dto);
    if (errors.length > 0) {
      const first = errors[0];
      const msg =
        Object.values(first.constraints ?? {})[0] ??
        'Dados do ticket inválidos.';
      throw new BadRequestException(msg);
    }

    return this.ticketsService.updateTicket(
      actor,
      ticketNumber,
      dto,
      files ?? [],
    );
  }

  @Get(':ticketNumber/history')
  @Roles('ADMIN', 'COLLABORATOR', 'PJ', 'CLIENT')
  @RequirePermission(PermissionModule.TICKETS, 'canView')
  history(
    @CurrentUser() actor: AuthenticatedRequestUser,
    @Param('ticketNumber', ParseIntPipe) ticketNumber: number,
  ) {
    return this.ticketsQueryService.getTicketHistory(actor, ticketNumber);
  }

  @Get(':ticketNumber')
  @Roles('ADMIN', 'COLLABORATOR', 'PJ', 'CLIENT')
  @RequirePermission(PermissionModule.TICKETS, 'canView')
  detail(
    @CurrentUser() actor: AuthenticatedRequestUser,
    @Param('ticketNumber', ParseIntPipe) ticketNumber: number,
  ) {
    return this.ticketsQueryService.getDetail(actor, ticketNumber);
  }

  @Patch(':ticketNumber/gmud')
  @Roles('ADMIN')
  @RequirePermission(PermissionModule.TICKETS, 'canCreate')
  linkGmud(
    @CurrentUser() actor: AuthenticatedRequestUser,
    @Param('ticketNumber', ParseIntPipe) ticketNumber: number,
    @Body() body: LinkTicketGmudDto,
  ) {
    return this.ticketsService.linkTicketGmud(
      actor,
      ticketNumber,
      body.externalGmudRef,
    );
  }

  @Post(':ticketNumber/appointments')
  @Roles('ADMIN', 'COLLABORATOR', 'PJ')
  @RequirePermission(PermissionModule.TICKETS, 'canCreate')
  @UseInterceptors(FilesInterceptor('files', 10, ticketAppointmentUploadLimits))
  async createAppointment(
    @CurrentUser() actor: AuthenticatedRequestUser,
    @Param('ticketNumber', ParseIntPipe) ticketNumber: number,
    @Body('payload') payloadRaw: string,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    if (!payloadRaw?.trim()) {
      throw new BadRequestException('Campo payload é obrigatório.');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(payloadRaw);
    } catch {
      throw new BadRequestException('Payload JSON inválido.');
    }

    const dto = plainToInstance(CreateTicketAppointmentDto, parsed);
    const errors = await validate(dto);
    if (errors.length > 0) {
      const first = errors[0];
      const msg =
        Object.values(first.constraints ?? {})[0] ??
        'Dados do apontamento inválidos.';
      throw new BadRequestException(msg);
    }

    return this.appointmentsService.createAppointment(
      actor,
      ticketNumber,
      dto,
      files ?? [],
    );
  }

  @Get(':ticketNumber/appointments/:portalAppointmentId/edit-context')
  @Roles('ADMIN', 'COLLABORATOR', 'PJ')
  @RequirePermission(PermissionModule.TICKETS, 'canCreate')
  portalAppointmentEditContext(
    @Param('ticketNumber', ParseIntPipe) ticketNumber: number,
    @Param('portalAppointmentId', ParseUUIDPipe) portalAppointmentId: string,
  ) {
    return this.appointmentsService.getPortalAppointmentEditContext(
      ticketNumber,
      portalAppointmentId,
    );
  }

  @Post(':ticketNumber/appointments/:portalAppointmentId/pause-sync')
  @Roles('ADMIN', 'COLLABORATOR', 'PJ')
  @RequirePermission(PermissionModule.TICKETS, 'canCreate')
  pausePortalAppointmentSync(
    @Param('ticketNumber', ParseIntPipe) ticketNumber: number,
    @Param('portalAppointmentId', ParseUUIDPipe) portalAppointmentId: string,
  ) {
    return this.appointmentsService.pausePortalAppointmentSync(
      ticketNumber,
      portalAppointmentId,
    );
  }

  @Post(':ticketNumber/appointments/:portalAppointmentId/resume-sync')
  @Roles('ADMIN', 'COLLABORATOR', 'PJ')
  @RequirePermission(PermissionModule.TICKETS, 'canCreate')
  resumePortalAppointmentSync(
    @Param('ticketNumber', ParseIntPipe) ticketNumber: number,
    @Param('portalAppointmentId', ParseUUIDPipe) portalAppointmentId: string,
  ) {
    return this.appointmentsService.resumePortalAppointmentSync(
      ticketNumber,
      portalAppointmentId,
    );
  }

  @Patch(':ticketNumber/appointments/:portalAppointmentId')
  @Roles('ADMIN', 'COLLABORATOR', 'PJ')
  @RequirePermission(PermissionModule.TICKETS, 'canCreate')
  @UseInterceptors(FilesInterceptor('files', 10, ticketAppointmentUploadLimits))
  async updatePortalAppointment(
    @CurrentUser() actor: AuthenticatedRequestUser,
    @Param('ticketNumber', ParseIntPipe) ticketNumber: number,
    @Param('portalAppointmentId', ParseUUIDPipe) portalAppointmentId: string,
    @Body('payload') payloadRaw: string,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    if (!payloadRaw?.trim()) {
      throw new BadRequestException('Campo payload é obrigatório.');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(payloadRaw);
    } catch {
      throw new BadRequestException('Payload JSON inválido.');
    }

    const dto = plainToInstance(UpdateTicketAppointmentDto, parsed);
    const errors = await validate(dto);
    if (errors.length > 0) {
      const first = errors[0];
      const msg =
        Object.values(first.constraints ?? {})[0] ??
        'Dados do apontamento inválidos.';
      throw new BadRequestException(msg);
    }

    return this.appointmentsService.updatePortalAppointment(
      actor,
      ticketNumber,
      portalAppointmentId,
      dto,
      files ?? [],
    );
  }

  @Delete(':ticketNumber/appointments/:portalAppointmentId')
  @Roles('ADMIN', 'COLLABORATOR', 'PJ')
  @RequirePermission(PermissionModule.TICKETS, 'canCreate')
  deletePortalAppointment(
    @Param('ticketNumber', ParseIntPipe) ticketNumber: number,
    @Param('portalAppointmentId', ParseUUIDPipe) portalAppointmentId: string,
  ) {
    return this.appointmentsService.deletePortalAppointment(
      ticketNumber,
      portalAppointmentId,
    );
  }
}
