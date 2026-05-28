import {
  Body,
  Controller,
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
  CreateRendimentoJustificationDto,
  DecideRendimentoJustificationDto,
  RendimentoTimesheetQueryDto,
} from './rendimento.dto';
import { RendimentoService } from './rendimento.service';

type AuthenticatedRequest = Request & { user: AuthenticatedRequestUser };

@ApiTags('Rendimento')
@ApiBearerAuth()
@Controller('rendimento')
@UseGuards(JwtAuthGuard, ModulePermissionGuard, RolesGuard)
@Roles('ADMIN', 'COLLABORATOR')
export class RendimentoController {
  constructor(private readonly rendimentoService: RendimentoService) {}

  @Get('collaborators')
  @RequirePermission(PermissionModule.RENDIMENTO, 'canView')
  @Roles('ADMIN')
  listCollaborators() {
    return this.rendimentoService.listCollaborators();
  }

  @Get('users/:userId/timesheet')
  @RequirePermission(PermissionModule.RENDIMENTO, 'canView')
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
}
