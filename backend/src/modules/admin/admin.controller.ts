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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedRequestUser } from '../auth/auth-request-user';
import { AdminService } from './admin.service';
import { parseAdminAuditLogsQuery } from './admin-audit.query';
import { ReprocessRendimentoAlertsDto } from './admin-reprocess.dto';
import { RendimentoService } from '../rendimento/rendimento.service';
import { TicketsOutboxService } from '../tickets/tickets-outbox.service';
import { DeskClassificationService } from './desk-classification.service';
import { TicketStageService } from './ticket-stage.service';
import {
  CreateDeskClassificationDto,
  CreateServiceDeskDto,
  UpdateDeskClassificationDto,
  UpdateServiceDeskDto,
} from './desk-classification.dto';
import { CreateTicketStageDto, UpdateTicketStageDto } from './ticket-stage.dto';
import {
  CreateTicketAutoOpenRuleDto,
  UpdateTicketAutoOpenRuleDto,
} from './ticket-auto-open.dto';
import { TicketAutoOpenService } from './ticket-auto-open.service';
import {
  CreateTicketAutomationRuleDto,
  UpdateTicketAutomationRuleDto,
} from '../tickets/ticket-automation.dto';
import { TicketAutomationService } from '../tickets/ticket-automation.service';

type AuthenticatedRequest = Request & { user: AuthenticatedRequestUser };

@Controller('admin')
@UseGuards(JwtAuthGuard, ModulePermissionGuard, RolesGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly rendimentoService: RendimentoService,
    private readonly deskClassificationService: DeskClassificationService,
    private readonly ticketStageService: TicketStageService,
    private readonly ticketAutoOpenService: TicketAutoOpenService,
    private readonly ticketAutomationService: TicketAutomationService,
    private readonly ticketsOutboxService: TicketsOutboxService,
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

  @Post('reprocess-tiflux-outbox')
  @RequirePermission(PermissionModule.ADMIN, 'canEdit')
  @AuditMeta({
    entity: 'PortalTifluxOutbox',
    action: 'REPROCESS',
  })
  async reprocessTifluxOutbox() {
    const requeued = await this.ticketsOutboxService.retryFailed(50);
    const result = await this.ticketsOutboxService.processPendingBatch(50);
    return { requeued, ...result };
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

  @Get('classifications/specialties')
  @RequirePermission(PermissionModule.ADMIN, 'canView')
  listClassificationSpecialties() {
    return this.deskClassificationService.listDesks();
  }

  /** @deprecated Prefer /admin/classifications/specialties */
  @Get('classifications/desks')
  @RequirePermission(PermissionModule.ADMIN, 'canView')
  listClassificationDesks() {
    return this.deskClassificationService.listDesks();
  }

  @Post('classifications/specialties')
  @RequirePermission(PermissionModule.ADMIN, 'canEdit')
  @AuditMeta({
    entity: 'Specialty',
    action: 'CREATE',
  })
  createClassificationSpecialty(@Body() body: CreateServiceDeskDto) {
    return this.deskClassificationService.createDesk(body);
  }

  /** @deprecated Prefer /admin/classifications/specialties */
  @Post('classifications/desks')
  @RequirePermission(PermissionModule.ADMIN, 'canEdit')
  @AuditMeta({
    entity: 'Specialty',
    action: 'CREATE',
  })
  createClassificationDesk(@Body() body: CreateServiceDeskDto) {
    return this.deskClassificationService.createDesk(body);
  }

  @Patch('classifications/specialties/:specialtyId')
  @RequirePermission(PermissionModule.ADMIN, 'canEdit')
  @AuditMeta({
    entity: 'Specialty',
    action: 'UPDATE',
  })
  updateClassificationSpecialty(
    @Param('specialtyId') specialtyId: string,
    @Body() body: UpdateServiceDeskDto,
  ) {
    return this.deskClassificationService.updateDesk(specialtyId, body);
  }

  /** @deprecated Prefer /admin/classifications/specialties/:specialtyId */
  @Patch('classifications/desks/:deskId')
  @RequirePermission(PermissionModule.ADMIN, 'canEdit')
  @AuditMeta({
    entity: 'Specialty',
    action: 'UPDATE',
  })
  updateClassificationDesk(
    @Param('deskId') deskId: string,
    @Body() body: UpdateServiceDeskDto,
  ) {
    return this.deskClassificationService.updateDesk(deskId, body);
  }

  @Delete('classifications/specialties/:specialtyId')
  @RequirePermission(PermissionModule.ADMIN, 'canEdit')
  @AuditMeta({
    entity: 'Specialty',
    action: 'DELETE',
  })
  deleteClassificationSpecialty(@Param('specialtyId') specialtyId: string) {
    return this.deskClassificationService.removeDesk(specialtyId);
  }

  /** @deprecated Prefer /admin/classifications/specialties/:specialtyId */
  @Delete('classifications/desks/:deskId')
  @RequirePermission(PermissionModule.ADMIN, 'canEdit')
  @AuditMeta({
    entity: 'Specialty',
    action: 'DELETE',
  })
  deleteClassificationDesk(@Param('deskId') deskId: string) {
    return this.deskClassificationService.removeDesk(deskId);
  }

  @Get('classifications')
  @RequirePermission(PermissionModule.ADMIN, 'canView')
  getClassificationTree(
    @Query('specialtyId') specialtyId?: string,
    @Query('serviceDeskId') serviceDeskId?: string,
  ) {
    return this.deskClassificationService.getTree(
      specialtyId || serviceDeskId || '',
    );
  }

  @Post('classifications')
  @RequirePermission(PermissionModule.ADMIN, 'canEdit')
  @AuditMeta({
    entity: 'SpecialtyClassification',
    action: 'CREATE',
  })
  createClassification(@Body() body: CreateDeskClassificationDto) {
    return this.deskClassificationService.create(body);
  }

  @Patch('classifications/:id')
  @RequirePermission(PermissionModule.ADMIN, 'canEdit')
  @AuditMeta({
    entity: 'SpecialtyClassification',
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
    entity: 'SpecialtyClassification',
    action: 'DELETE',
  })
  deleteClassification(@Param('id') id: string) {
    return this.deskClassificationService.remove(id);
  }

  @Get('ticket-stages')
  @RequirePermission(PermissionModule.ADMIN, 'canView')
  listTicketStages() {
    return this.ticketStageService.list();
  }

  @Post('ticket-stages')
  @RequirePermission(PermissionModule.ADMIN, 'canEdit')
  @AuditMeta({
    entity: 'TicketStage',
    action: 'CREATE',
  })
  createTicketStage(@Body() body: CreateTicketStageDto) {
    return this.ticketStageService.create(body);
  }

  @Patch('ticket-stages/:id')
  @RequirePermission(PermissionModule.ADMIN, 'canEdit')
  @AuditMeta({
    entity: 'TicketStage',
    action: 'UPDATE',
  })
  updateTicketStage(
    @Param('id') id: string,
    @Body() body: UpdateTicketStageDto,
  ) {
    return this.ticketStageService.update(id, body);
  }

  @Delete('ticket-stages/:id')
  @RequirePermission(PermissionModule.ADMIN, 'canEdit')
  @AuditMeta({
    entity: 'TicketStage',
    action: 'DELETE',
  })
  deleteTicketStage(@Param('id') id: string) {
    return this.ticketStageService.remove(id);
  }

  @Get('ticket-auto-open-rules')
  @RequirePermission(PermissionModule.ADMIN, 'canView')
  listTicketAutoOpenRules() {
    return this.ticketAutoOpenService.list();
  }

  @Post('ticket-auto-open-rules')
  @RequirePermission(PermissionModule.ADMIN, 'canEdit')
  @AuditMeta({
    entity: 'TicketAutoOpenRule',
    action: 'CREATE',
  })
  createTicketAutoOpenRule(
    @CurrentUser() actor: AuthenticatedRequestUser,
    @Body() body: CreateTicketAutoOpenRuleDto,
  ) {
    return this.ticketAutoOpenService.create(actor, body);
  }

  @Patch('ticket-auto-open-rules/:id')
  @RequirePermission(PermissionModule.ADMIN, 'canEdit')
  @AuditMeta({
    entity: 'TicketAutoOpenRule',
    action: 'UPDATE',
  })
  updateTicketAutoOpenRule(
    @Param('id') id: string,
    @Body() body: UpdateTicketAutoOpenRuleDto,
  ) {
    return this.ticketAutoOpenService.update(id, body);
  }

  @Patch('ticket-auto-open-rules/:id/active')
  @RequirePermission(PermissionModule.ADMIN, 'canEdit')
  setTicketAutoOpenRuleActive(
    @Param('id') id: string,
    @Body() body: { active: boolean },
  ) {
    return this.ticketAutoOpenService.setActive(id, Boolean(body.active));
  }

  @Delete('ticket-auto-open-rules/:id')
  @RequirePermission(PermissionModule.ADMIN, 'canEdit')
  @AuditMeta({
    entity: 'TicketAutoOpenRule',
    action: 'DELETE',
  })
  deleteTicketAutoOpenRule(@Param('id') id: string) {
    return this.ticketAutoOpenService.remove(id);
  }

  @Post('ticket-auto-open-rules/run-due')
  @RequirePermission(PermissionModule.ADMIN, 'canEdit')
  runDueTicketAutoOpenRules() {
    return this.ticketAutoOpenService.processDueRules(20);
  }

  @Get('ticket-automation-rules')
  @RequirePermission(PermissionModule.ADMIN, 'canView')
  listTicketAutomationRules() {
    return this.ticketAutomationService.list();
  }

  @Post('ticket-automation-rules')
  @RequirePermission(PermissionModule.ADMIN, 'canEdit')
  @AuditMeta({
    entity: 'TicketAutomationRule',
    action: 'CREATE',
  })
  createTicketAutomationRule(
    @CurrentUser() actor: AuthenticatedRequestUser,
    @Body() body: CreateTicketAutomationRuleDto,
  ) {
    return this.ticketAutomationService.create(actor, body);
  }

  @Patch('ticket-automation-rules/:id')
  @RequirePermission(PermissionModule.ADMIN, 'canEdit')
  @AuditMeta({
    entity: 'TicketAutomationRule',
    action: 'UPDATE',
  })
  updateTicketAutomationRule(
    @Param('id') id: string,
    @Body() body: UpdateTicketAutomationRuleDto,
  ) {
    return this.ticketAutomationService.update(id, body);
  }

  @Patch('ticket-automation-rules/:id/active')
  @RequirePermission(PermissionModule.ADMIN, 'canEdit')
  setTicketAutomationRuleActive(
    @Param('id') id: string,
    @Body() body: { active: boolean },
  ) {
    return this.ticketAutomationService.setActive(id, Boolean(body.active));
  }

  @Delete('ticket-automation-rules/:id')
  @RequirePermission(PermissionModule.ADMIN, 'canEdit')
  @AuditMeta({
    entity: 'TicketAutomationRule',
    action: 'DELETE',
  })
  deleteTicketAutomationRule(@Param('id') id: string) {
    return this.ticketAutomationService.remove(id);
  }
}
