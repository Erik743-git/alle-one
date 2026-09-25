import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Put,
  Post,
  Query,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { primeiraMensagemDeValidacao } from '../../common/validation/traduzir-validacao';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PermissionModule } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { isClientPortalRole } from '../../common/security/client-portal-role';
import {
  TICKET_APPOINTMENT_MAX_FILES,
  ticketAppointmentUploadLimits,
} from '../../common/upload.config';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedRequestUser } from '../auth/auth-request-user';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ModulePermissionGuard } from '../auth/guards/module-permission.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  AcknowledgeAppointmentWarningDto,
  CreateTicketAppointmentDto,
  CreateTicketDto,
  UpdateTicketAppointmentDto,
  UpdateTicketDto,
} from './tickets-create.dto';
import {
  SearchTicketUsersQueryDto,
  TicketsListQueryDto,
  UpdateTicketStageDto,
  GroupTicketDto,
  AppointmentOverlapQueryDto,
} from './tickets.dto';
import { LinkTicketGmudDto } from './tickets-gmud.dto';
import { TicketsAppointmentsService } from './tickets-appointments.service';
import { TicketsReconcileService } from './tickets-reconcile.service';
import { TicketsCatalogsService } from './tickets-catalogs.service';
import { TicketsQueryService } from './tickets-query.service';
import { TicketsService } from './tickets.service';
import { resolveTicketStageGroup } from './tickets-stage-groups';
import { TicketListPresetsService } from './ticket-list-presets.service';
import { TicketListStateService } from './ticket-list-state.service';
import {
  CreateTicketListPresetDto,
  UpdateTicketListPresetDto,
} from './ticket-list-presets.dto';
import { cabecalhosDeArquivo } from '../../common/http/content-disposition';
import { ModuloPortal } from '../acesso/modulo-portal.decorator';

/** Cliente sempre aponta em hora normal. */
const CLIENT_APPOINTMENT_SERVICE_NAME = 'HORA NORMAL';

@ApiTags('Tickets')
@ApiBearerAuth()
@ModuloPortal('tickets')
@Controller('tickets')
@UseGuards(JwtAuthGuard, ModulePermissionGuard, RolesGuard)
export class TicketsController {
  private readonly logger = new Logger(TicketsController.name);

  constructor(
    private readonly ticketsService: TicketsService,
    private readonly ticketsQueryService: TicketsQueryService,
    private readonly catalogsService: TicketsCatalogsService,
    private readonly appointmentsService: TicketsAppointmentsService,
    private readonly reconcileService: TicketsReconcileService,
    private readonly listPresetsService: TicketListPresetsService,
    private readonly listStateService: TicketListStateService,
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

  /** Estado da tela de tickets do próprio usuário. */
  @Get('list-state')
  @Roles('ADMIN', 'COLLABORATOR', 'PJ', 'CLIENT')
  @RequirePermission(PermissionModule.TICKETS, 'canView')
  getListState(@CurrentUser() actor: AuthenticatedRequestUser) {
    return this.listStateService.get(actor.userId);
  }

  @Put('list-state')
  @Roles('ADMIN', 'COLLABORATOR', 'PJ', 'CLIENT')
  @RequirePermission(PermissionModule.TICKETS, 'canView')
  saveListState(
    @CurrentUser() actor: AuthenticatedRequestUser,
    @Body('state') state: unknown,
  ) {
    return this.listStateService.save(actor.userId, state);
  }

  @Get('list-presets')
  @Roles('ADMIN', 'COLLABORATOR', 'PJ', 'CLIENT')
  @RequirePermission(PermissionModule.TICKETS, 'canView')
  listPresets(@CurrentUser() actor: AuthenticatedRequestUser) {
    return this.listPresetsService.list(actor);
  }

  @Post('list-presets')
  @Roles('ADMIN', 'COLLABORATOR', 'PJ', 'CLIENT')
  @RequirePermission(PermissionModule.TICKETS, 'canView')
  createListPreset(
    @CurrentUser() actor: AuthenticatedRequestUser,
    @Body() dto: CreateTicketListPresetDto,
  ) {
    return this.listPresetsService.create(actor, dto);
  }

  @Patch('list-presets/:id')
  @Roles('ADMIN', 'COLLABORATOR', 'PJ', 'CLIENT')
  @RequirePermission(PermissionModule.TICKETS, 'canView')
  updateListPreset(
    @CurrentUser() actor: AuthenticatedRequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTicketListPresetDto,
  ) {
    return this.listPresetsService.update(actor, id, dto);
  }

  @Delete('list-presets/:id')
  @Roles('ADMIN', 'COLLABORATOR', 'PJ', 'CLIENT')
  @RequirePermission(PermissionModule.TICKETS, 'canView')
  deleteListPreset(
    @CurrentUser() actor: AuthenticatedRequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.listPresetsService.remove(actor, id);
  }

  @Get('catalogs/create')
  @Roles('ADMIN', 'COLLABORATOR', 'PJ', 'CLIENT')
  @RequirePermission(PermissionModule.TICKETS, 'canCreate')
  createCatalogs(
    @CurrentUser() actor: AuthenticatedRequestUser,
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
      actor,
      deskId != null && Number.isFinite(deskId) ? deskId : undefined,
      clientId != null && Number.isFinite(clientId) ? clientId : undefined,
    );
  }

  @Get('users/search')
  // Cliente só encontra pessoas da própria empresa (filtrado no serviço).
  @Roles('ADMIN', 'COLLABORATOR', 'PJ', 'CLIENT')
  @RequirePermission(PermissionModule.TICKETS, 'canCreate')
  searchUsers(
    @CurrentUser() actor: AuthenticatedRequestUser,
    @Query() query: SearchTicketUsersQueryDto,
  ) {
    return this.ticketsService.searchUsersForCc(query.q, actor);
  }

  /**
   * Busca rápida da paleta (Ctrl+K): tickets, empresas e colaboradores.
   *
   * Precisa vir ANTES de `@Get(':ticketNumber')`: o Nest casa rotas na ordem
   * de declaração, então lá embaixo esta URL batia no parâmetro, o
   * ParseIntPipe recusava "quick-search" e a busca respondia 400.
   */
  @Get('quick-search')
  @Roles('ADMIN', 'COLLABORATOR', 'PJ', 'CLIENT')
  @RequirePermission(PermissionModule.TICKETS, 'canView')
  quickSearch(
    @CurrentUser() actor: AuthenticatedRequestUser,
    @Query('q') q?: string,
  ) {
    return this.ticketsQueryService.quickSearch(actor, q ?? '');
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
    const cabecalhos = cabecalhosDeArquivo({
      mimeType: meta.mimeType,
      originalName: meta.originalName,
      inline: meta.inline,
    });
    for (const [nome, valor] of Object.entries(cabecalhos)) {
      res?.setHeader(nome, valor);
    }
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
  @UseInterceptors(
    FilesInterceptor(
      'files',
      TICKET_APPOINTMENT_MAX_FILES,
      ticketAppointmentUploadLimits,
    ),
  )
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
      throw new BadRequestException(
        primeiraMensagemDeValidacao(errors, 'Dados do chamado inválidos.'),
      );
    }

    // Aberto por uma pessoa: se ela deixar outra como responsável, essa
    // outra recebe aviso. A rotina automática chama o serviço sem isto.
    return this.ticketsService.createTicket(actor, dto, files ?? [], {
      avisarNovoResponsavel: true,
    });
  }

  @Get(':ticketNumber/catalogs/appointment')
  // Cliente usa para registrar comunicação (escopo checado no serviço).
  @Roles('ADMIN', 'COLLABORATOR', 'PJ', 'CLIENT')
  @RequirePermission(PermissionModule.TICKETS, 'canCreate')
  appointmentCatalogs(
    @CurrentUser() actor: AuthenticatedRequestUser,
    @Param('ticketNumber', ParseIntPipe) ticketNumber: number,
  ) {
    return this.appointmentsService.getAppointmentCatalogs(ticketNumber, actor);
  }

  @Get(':ticketNumber/warnings/pending')
  @Roles('ADMIN', 'COLLABORATOR', 'PJ', 'CLIENT')
  @RequirePermission(PermissionModule.TICKETS, 'canView')
  pendingAppointmentWarnings(
    @CurrentUser() actor: AuthenticatedRequestUser,
    @Param('ticketNumber', ParseIntPipe) ticketNumber: number,
  ) {
    return this.appointmentsService.listPendingAppointmentWarnings(
      actor,
      ticketNumber,
    );
  }

  @Get(':ticketNumber/warnings/:portalAppointmentId')
  @Roles('ADMIN', 'COLLABORATOR', 'PJ', 'CLIENT')
  @RequirePermission(PermissionModule.TICKETS, 'canView')
  appointmentWarningDetail(
    @CurrentUser() actor: AuthenticatedRequestUser,
    @Param('ticketNumber', ParseIntPipe) ticketNumber: number,
    @Param('portalAppointmentId', ParseUUIDPipe) portalAppointmentId: string,
  ) {
    return this.appointmentsService.getAppointmentWarningDetail(
      actor,
      ticketNumber,
      portalAppointmentId,
    );
  }

  @Post(':ticketNumber/warnings/:portalAppointmentId/acknowledge')
  @Roles('ADMIN', 'COLLABORATOR', 'PJ', 'CLIENT')
  @RequirePermission(PermissionModule.TICKETS, 'canView')
  acknowledgeAppointmentWarning(
    @CurrentUser() actor: AuthenticatedRequestUser,
    @Param('ticketNumber', ParseIntPipe) ticketNumber: number,
    @Param('portalAppointmentId', ParseUUIDPipe) portalAppointmentId: string,
    @Body() body: AcknowledgeAppointmentWarningDto,
  ) {
    return this.appointmentsService.acknowledgeAppointmentWarning(
      actor,
      ticketNumber,
      portalAppointmentId,
      Boolean(body.permanent),
    );
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
  // Cliente gestor troca o estágio dos chamados da própria empresa
  // (escopo checado no serviço).
  @Roles('ADMIN', 'COLLABORATOR', 'PJ', 'CLIENT')
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
      { motivoCancelamento: body.cancelReason },
    );
  }

  @Patch(':ticketNumber')
  // Cliente gestor: só responsável, solicitante, mesa e fechar/reabrir
  // (regras em TicketsService.assertClientGestorTicketUpdate).
  @Roles('ADMIN', 'COLLABORATOR', 'PJ', 'CLIENT')
  @RequirePermission(PermissionModule.TICKETS, 'canCreate')
  @UseInterceptors(
    FilesInterceptor(
      'files',
      TICKET_APPOINTMENT_MAX_FILES,
      ticketAppointmentUploadLimits,
    ),
  )
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
      throw new BadRequestException(
        primeiraMensagemDeValidacao(errors, 'Dados do ticket inválidos.'),
      );
    }

    return this.ticketsService.updateTicket(
      actor,
      ticketNumber,
      dto,
      files ?? [],
      // Edição feita por uma pessoa: quem ela colocar como responsável
      // recebe aviso. A automação chama o serviço sem isto.
      { avisarNovoResponsavel: true },
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

  @Post(':ticketNumber/watchers')
  // Cliente só no ticket da própria empresa (checado no serviço).
  @Roles('ADMIN', 'COLLABORATOR', 'PJ', 'CLIENT')
  @RequirePermission(PermissionModule.TICKETS, 'canCreate')
  addWatcher(
    @CurrentUser() actor: AuthenticatedRequestUser,
    @Param('ticketNumber', ParseIntPipe) ticketNumber: number,
    @Body() body: { email: string },
  ) {
    return this.ticketsService.addTicketWatcher(
      actor,
      ticketNumber,
      body.email ?? '',
    );
  }

  @Delete(':ticketNumber/watchers/:email')
  @Roles('ADMIN', 'COLLABORATOR', 'PJ', 'CLIENT')
  @RequirePermission(PermissionModule.TICKETS, 'canCreate')
  removeWatcher(
    @CurrentUser() actor: AuthenticatedRequestUser,
    @Param('ticketNumber', ParseIntPipe) ticketNumber: number,
    @Param('email') email: string,
  ) {
    return this.ticketsService.removeTicketWatcher(
      actor,
      ticketNumber,
      decodeURIComponent(email),
    );
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
  @Roles('ADMIN', 'COLLABORATOR', 'PJ')
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

  @Post(':ticketNumber/group')
  @Roles('ADMIN', 'COLLABORATOR', 'PJ')
  @RequirePermission(PermissionModule.TICKETS, 'canCreate')
  groupTicket(
    @CurrentUser() actor: AuthenticatedRequestUser,
    @Param('ticketNumber', ParseIntPipe) ticketNumber: number,
    @Body() body: GroupTicketDto,
  ) {
    return this.ticketsService.groupIntoParent(
      actor,
      ticketNumber,
      body.parentTicketNumber,
    );
  }

  /**
   * Apontamentos do próprio usuário que cruzam o horário informado. Consultado
   * pela tela antes de salvar, para avisar sobre dupla contagem de hora.
   */
  @Get('appointments/overlaps')
  // Só os apontamentos do próprio usuário.
  @Roles('ADMIN', 'COLLABORATOR', 'PJ', 'CLIENT')
  @RequirePermission(PermissionModule.TICKETS, 'canCreate')
  appointmentOverlaps(
    @CurrentUser() actor: AuthenticatedRequestUser,
    @Query() query: AppointmentOverlapQueryDto,
  ) {
    return this.appointmentsService.findOwnOverlaps({
      actor,
      date: query.date,
      initTime: query.initTime,
      endTime: query.endTime,
      ignorePortalAppointmentId: query.ignorePortalAppointmentId,
    });
  }

  @Post(':ticketNumber/appointments')
  // Cliente aponta só em ticket da própria empresa (checado no serviço).
  @Roles('ADMIN', 'COLLABORATOR', 'PJ', 'CLIENT')
  @RequirePermission(PermissionModule.TICKETS, 'canCreate')
  @UseInterceptors(
    FilesInterceptor(
      'files',
      TICKET_APPOINTMENT_MAX_FILES,
      ticketAppointmentUploadLimits,
    ),
  )
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
    const isClient = isClientPortalRole(actor.role);
    if (isClient) dto.serviceName = CLIENT_APPOINTMENT_SERVICE_NAME;
    const errors = await validate(dto);
    if (errors.length > 0) {
      throw new BadRequestException(
        primeiraMensagemDeValidacao(errors, 'Dados do apontamento inválidos.'),
      );
    }

    const result = await this.appointmentsService.createAppointment(
      actor,
      ticketNumber,
      dto,
      files ?? [],
    );
    if (isClient)
      await this.startTicketAfterClientAppointment(actor, ticketNumber);
    return result;
  }

  /** Cliente apontou em chamado "Novo": passa para atendimento (ele não troca estágio pela tela). */
  private async startTicketAfterClientAppointment(
    actor: AuthenticatedRequestUser,
    ticketNumber: number,
  ) {
    try {
      const info = await this.ticketsQueryService.listTicketStages(
        actor,
        ticketNumber,
      );
      if (
        info.isClosed ||
        resolveTicketStageGroup(info.currentStageName) !== 'novo'
      ) {
        return;
      }
      const target = info.stages.find(
        (stage) => resolveTicketStageGroup(stage.name) === 'atendimento',
      );
      if (!target) return;
      await this.ticketsQueryService.updateTicketStage(
        actor,
        ticketNumber,
        target.id,
        { systemTransition: true },
      );
    } catch (error) {
      // O apontamento já foi salvo; falhar aqui não pode desfazer isso.
      this.logger.warn(
        `Ticket #${ticketNumber}: não passou para atendimento após apontamento do cliente: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  @Get(':ticketNumber/appointments/:portalAppointmentId/edit-context')
  @Roles('ADMIN', 'COLLABORATOR', 'PJ', 'CLIENT')
  @RequirePermission(PermissionModule.TICKETS, 'canCreate')
  portalAppointmentEditContext(
    @CurrentUser() actor: AuthenticatedRequestUser,
    @Param('ticketNumber', ParseIntPipe) ticketNumber: number,
    @Param('portalAppointmentId', ParseUUIDPipe) portalAppointmentId: string,
  ) {
    return this.appointmentsService.getPortalAppointmentEditContext(
      ticketNumber,
      portalAppointmentId,
      actor,
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
  @Roles('ADMIN', 'COLLABORATOR', 'PJ', 'CLIENT')
  @RequirePermission(PermissionModule.TICKETS, 'canCreate')
  @UseInterceptors(
    FilesInterceptor(
      'files',
      TICKET_APPOINTMENT_MAX_FILES,
      ticketAppointmentUploadLimits,
    ),
  )
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
    if (isClientPortalRole(actor.role)) {
      dto.serviceName = CLIENT_APPOINTMENT_SERVICE_NAME;
    }
    const errors = await validate(dto);
    if (errors.length > 0) {
      throw new BadRequestException(
        primeiraMensagemDeValidacao(errors, 'Dados do apontamento inválidos.'),
      );
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
  @Roles('ADMIN', 'COLLABORATOR', 'PJ', 'CLIENT')
  @RequirePermission(PermissionModule.TICKETS, 'canCreate')
  deletePortalAppointment(
    @CurrentUser() actor: AuthenticatedRequestUser,
    @Param('ticketNumber', ParseIntPipe) ticketNumber: number,
    @Param('portalAppointmentId', ParseUUIDPipe) portalAppointmentId: string,
  ) {
    return this.appointmentsService.deletePortalAppointment(
      actor,
      ticketNumber,
      portalAppointmentId,
    );
  }
}
