import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  ParseUUIDPipe,
  Query,
  Req,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { PermissionModule } from '@prisma/client';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ModulePermissionGuard } from '../auth/guards/module-permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedRequestUser } from '../auth/auth-request-user';
import {
  AnswerRendimentoAppointmentQuestionDto,
  CreateRendimentoAppointmentQuestionDto,
  BulkDecideRendimentoDayEventsDto,
  BulkDecideRendimentoJustificationsDto,
  CreateRendimentoJustificationDto,
  DecideRendimentoDayEventDto,
  DecideRendimentoJustificationDto,
  ListPendingOvertimeQueryDto,
  ListCompanyQuestionsQueryDto,
  RendimentoCompanyAgendaQueryDto,
  RendimentoTimesheetQueryDto,
  UpdateCollaboratorListPreferenceDto,
} from './rendimento.dto';
import { AuditMeta } from '../audit/audit.decorator';
import { RendimentoCompanyService } from './rendimento-company.service';
import { RendimentoService } from './rendimento.service';

type AuthenticatedRequest = Request & { user: AuthenticatedRequestUser };

@ApiTags('Rendimento')
@ApiBearerAuth()
@Controller('rendimento')
@UseGuards(JwtAuthGuard, ModulePermissionGuard, RolesGuard)
@Roles('ADMIN', 'COLLABORATOR', 'CLIENT')
export class RendimentoController {
  constructor(
    private readonly rendimentoService: RendimentoService,
    private readonly rendimentoCompanyService: RendimentoCompanyService,
  ) {}

  @Get('companies')
  @RequirePermission(PermissionModule.RENDIMENTO, 'canView')
  @Roles('ADMIN', 'CLIENT')
  listCompanies(@Req() req: AuthenticatedRequest) {
    return this.rendimentoCompanyService.listCompanies(req.user);
  }

  @Get('companies/:companyId/agenda')
  @RequirePermission(PermissionModule.RENDIMENTO, 'canView')
  @Roles('ADMIN', 'CLIENT')
  getCompanyAgenda(
    @Req() req: AuthenticatedRequest,
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Query() query: RendimentoCompanyAgendaQueryDto,
  ) {
    return this.rendimentoCompanyService.getCompanyAgenda({
      actor: req.user,
      companyId,
      view: query.view,
      date: query.date,
    });
  }

  @Get('companies/:companyId/questions')
  @RequirePermission(PermissionModule.RENDIMENTO, 'canApprove')
  @Roles('ADMIN')
  listCompanyQuestions(
    @Req() req: AuthenticatedRequest,
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Query() query: ListCompanyQuestionsQueryDto,
  ) {
    return this.rendimentoCompanyService.listCompanyQuestions({
      actor: req.user,
      companyId,
      status: query.status,
    });
  }

  @Post('companies/:companyId/questions')
  @RequirePermission(PermissionModule.RENDIMENTO, 'canView')
  @Roles('CLIENT')
  @AuditMeta({
    entity: 'RendimentoAppointmentQuestion',
    action: 'CREATE',
    entityIdParam: 'companyId',
  })
  createAppointmentQuestion(
    @Req() req: AuthenticatedRequest,
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Body() body: CreateRendimentoAppointmentQuestionDto,
  ) {
    return this.rendimentoCompanyService.createQuestion({
      actor: req.user,
      companyId,
      appointmentSource: body.appointmentSource,
      appointmentRef: body.appointmentRef,
      ticketNumber: body.ticketNumber,
      date: body.date,
      initTime: body.initTime,
      endTime: body.endTime,
      userName: body.userName,
      description: body.description,
      message: body.message,
    });
  }

  @Patch('questions/:id/answer')
  @RequirePermission(PermissionModule.RENDIMENTO, 'canApprove')
  @Roles('ADMIN')
  @AuditMeta({
    entity: 'RendimentoAppointmentQuestion',
    action: 'ANSWER',
    entityIdParam: 'id',
  })
  answerAppointmentQuestion(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AnswerRendimentoAppointmentQuestionDto,
  ) {
    return this.rendimentoCompanyService.answerQuestion({
      actor: req.user,
      questionId: id,
      responseNote: body.responseNote,
      abonar: body.abonar,
      responseCode: body.responseCode,
    });
  }

  @Get('collaborators')
  @RequirePermission(PermissionModule.RENDIMENTO, 'canView')
  @Roles('ADMIN')
  listCollaborators() {
    return this.rendimentoService.listCollaborators();
  }

  @Get('collaborators/list-preferences')
  @RequirePermission(PermissionModule.RENDIMENTO, 'canView')
  @Roles('ADMIN')
  listCollaboratorListPreferences() {
    return this.rendimentoService.listCollaboratorListPreferences();
  }

  @Patch('collaborators/list-preferences/:collaboratorUserId')
  @RequirePermission(PermissionModule.RENDIMENTO, 'canView')
  @Roles('ADMIN')
  setCollaboratorListPreference(
    @Param('collaboratorUserId', ParseUUIDPipe) collaboratorUserId: string,
    @Body() body: UpdateCollaboratorListPreferenceDto,
  ) {
    return this.rendimentoService.setCollaboratorListPreference({
      collaboratorUserId,
      listed: body.listed,
    });
  }

  @Get('users/:userId/timesheet')
  @RequirePermission(PermissionModule.RENDIMENTO, 'canView')
  @Roles('ADMIN', 'COLLABORATOR', 'PJ')
  getTimesheet(
    @Req() req: AuthenticatedRequest,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query() query: RendimentoTimesheetQueryDto,
  ) {
    return this.rendimentoService.getTimesheet({
      actor: req.user,
      userId,
      view: query.view,
      date: query.date,
    });
  }

  @Post('users/:userId/justifications')
  @RequirePermission(PermissionModule.RENDIMENTO, 'canEdit')
  @Roles('ADMIN', 'COLLABORATOR')
  @AuditMeta({
    entity: 'RendimentoGapJustification',
    action: 'CREATE',
    entityIdParam: 'userId',
  })
  createGapJustification(
    @Req() req: AuthenticatedRequest,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() body: CreateRendimentoJustificationDto,
  ) {
    return this.rendimentoService.createGapJustification({
      actor: req.user,
      userId,
      date: body.date,
      fromTime: body.fromTime,
      toTime: body.toTime,
      gapType: body.gapType,
      gapMinutes: body.gapMinutes,
      kind: body.kind,
      reason: body.reason,
      debitOvertime: body.debitOvertime,
      overtimeMinutes: body.overtimeMinutes,
    });
  }

  @Patch('justifications/:id/decision')
  @RequirePermission(PermissionModule.RENDIMENTO, 'canApprove')
  @Roles('ADMIN')
  @AuditMeta({
    entity: 'RendimentoGapJustification',
    action: 'DECIDE',
    entityIdParam: 'id',
  })
  decideGapJustification(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: DecideRendimentoJustificationDto,
  ) {
    return this.rendimentoService.decideGapJustification({
      actor: req.user,
      justificationId: id,
      decision: body.decision,
      note: body.note,
    });
  }

  @Get('justifications/pending')
  @RequirePermission(PermissionModule.RENDIMENTO, 'canApprove')
  @Roles('ADMIN')
  listPendingJustifications(
    @Query() query: ListPendingOvertimeQueryDto,
  ) {
    return this.rendimentoService.listPendingJustifications({
      start: query.start,
      end: query.end,
      userId: query.userId,
      statusFilters: query.statusFilters,
    });
  }

  @Patch('justifications/bulk-decision')
  @RequirePermission(PermissionModule.RENDIMENTO, 'canApprove')
  @Roles('ADMIN')
  @AuditMeta({
    entity: 'RendimentoGapJustification',
    action: 'BULK_DECIDE',
  })
  bulkDecideJustifications(
    @Req() req: AuthenticatedRequest,
    @Body() body: BulkDecideRendimentoJustificationsDto,
  ) {
    return this.rendimentoService.bulkDecideGapJustifications({
      actor: req.user,
      ids: body.ids,
      decision: body.decision,
      note: body.note,
    });
  }

  @Delete('justifications/:id')
  @RequirePermission(PermissionModule.RENDIMENTO, 'canView')
  @Roles('ADMIN', 'COLLABORATOR')
  @AuditMeta({
    entity: 'RendimentoGapJustification',
    action: 'DELETE',
    entityIdParam: 'id',
  })
  deleteGapJustification(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.rendimentoService.deleteGapJustification({
      actor: req.user,
      justificationId: id,
    });
  }

  @Get('overtime/pending')
  @RequirePermission(PermissionModule.RENDIMENTO, 'canApprove')
  @Roles('ADMIN')
  listPendingOvertime(
    @Query() query: ListPendingOvertimeQueryDto,
  ) {
    return this.rendimentoService.listPendingOvertimeEvents({
      start: query.start,
      end: query.end,
      userId: query.userId,
      statusFilters: query.statusFilters,
    });
  }

  @Patch('events/bulk-decision')
  @RequirePermission(PermissionModule.RENDIMENTO, 'canApprove')
  @Roles('ADMIN')
  @AuditMeta({
    entity: 'RendimentoDayEvent',
    action: 'BULK_DECIDE',
  })
  bulkDecideDayEvents(
    @Req() req: AuthenticatedRequest,
    @Body() body: BulkDecideRendimentoDayEventsDto,
  ) {
    return this.rendimentoService.bulkDecideDayEvents({
      actor: req.user,
      ids: body.ids,
      decision: body.decision,
    });
  }

  @Patch('events/:id/decision')
  @RequirePermission(PermissionModule.RENDIMENTO, 'canApprove')
  @Roles('ADMIN')
  @AuditMeta({
    entity: 'RendimentoDayEvent',
    action: 'DECIDE',
    entityIdParam: 'id',
  })
  decideDayEvent(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: DecideRendimentoDayEventDto,
  ) {
    return this.rendimentoService.decideDayEvent({
      actor: req.user,
      eventId: id,
      decision: body.decision,
    });
  }
}
