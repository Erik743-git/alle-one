import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedRequestUser } from '../auth/auth-request-user';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  CreateEmailInboundRouteDto,
  EmailInboundAdminService,
  UpdateEmailInboundRouteDto,
  UpsertEmailInboundSettingsDto,
} from './email-inbound-admin.service';
import {
  OpenPreTicketDto,
  PreTicketsService,
} from './pre-tickets.service';

@Controller()
@UseGuards(RolesGuard)
export class EmailInboundController {
  constructor(
    private readonly admin: EmailInboundAdminService,
    private readonly preTickets: PreTicketsService,
  ) {}

  @Get('admin/email/settings')
  @Roles(UserRole.ADMIN)
  getSettings() {
    return this.admin.getSettings();
  }

  @Patch('admin/email/settings')
  @Roles(UserRole.ADMIN)
  updateSettings(@Body() dto: UpsertEmailInboundSettingsDto) {
    return this.admin.updateSettings(dto);
  }

  @Get('admin/email/routes')
  @Roles(UserRole.ADMIN)
  listRoutes() {
    return this.admin.listRoutes();
  }

  @Post('admin/email/routes')
  @Roles(UserRole.ADMIN)
  createRoute(
    @CurrentUser() actor: AuthenticatedRequestUser,
    @Body() dto: CreateEmailInboundRouteDto,
  ) {
    return this.admin.createRoute(actor, dto);
  }

  @Patch('admin/email/routes/:id')
  @Roles(UserRole.ADMIN)
  updateRoute(@Param('id') id: string, @Body() dto: UpdateEmailInboundRouteDto) {
    return this.admin.updateRoute(id, dto);
  }

  @Delete('admin/email/routes/:id')
  @Roles(UserRole.ADMIN)
  deleteRoute(@Param('id') id: string) {
    return this.admin.deleteRoute(id);
  }

  @Post('admin/email/poll')
  @Roles(UserRole.ADMIN)
  pollNow() {
    return this.admin.pollNow();
  }

  @Get('pre-tickets/count')
  @Roles(UserRole.ADMIN, UserRole.COLLABORATOR)
  count(@CurrentUser() actor: AuthenticatedRequestUser) {
    return this.preTickets.countPending(actor).then((count) => ({ count }));
  }

  @Get('pre-tickets')
  @Roles(UserRole.ADMIN, UserRole.COLLABORATOR)
  list(
    @CurrentUser() actor: AuthenticatedRequestUser,
    @Query('q') q?: string,
  ) {
    return this.preTickets.list(actor, q);
  }

  @Get('pre-tickets/:id')
  @Roles(UserRole.ADMIN, UserRole.COLLABORATOR)
  getOne(
    @CurrentUser() actor: AuthenticatedRequestUser,
    @Param('id') id: string,
  ) {
    return this.preTickets.getOne(actor, id);
  }

  @Get('pre-tickets/:id/attachments/:attachmentId')
  @Roles(UserRole.ADMIN, UserRole.COLLABORATOR)
  async downloadAttachment(
    @CurrentUser() actor: AuthenticatedRequestUser,
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @Query('inline') inline?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const { stream, meta } = await this.preTickets.downloadAttachment(
      actor,
      id,
      attachmentId,
      inline === 'true',
    );
    res?.setHeader('Content-Type', meta.mimeType || 'application/octet-stream');
    res?.setHeader(
      'Content-Disposition',
      `${meta.inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(meta.originalName)}"`,
    );
    return stream;
  }

  @Delete('pre-tickets/:id')
  @Roles(UserRole.ADMIN, UserRole.COLLABORATOR)
  remove(
    @CurrentUser() actor: AuthenticatedRequestUser,
    @Param('id') id: string,
  ) {
    return this.preTickets.softDelete(actor, id);
  }

  @Post('pre-tickets/:id/open')
  @Roles(UserRole.ADMIN, UserRole.COLLABORATOR)
  open(
    @CurrentUser() actor: AuthenticatedRequestUser,
    @Param('id') id: string,
    @Body() dto: OpenPreTicketDto,
  ) {
    return this.preTickets.openAsTicket(actor, id, dto);
  }
}
