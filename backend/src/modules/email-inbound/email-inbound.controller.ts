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
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedRequestUser } from '../auth/auth-request-user';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { EmailTemplatesService } from '../mail/email-templates.service';
import {
  CreateEmailInboundRouteDto,
  EmailInboundAdminService,
  UpdateEmailInboundRouteDto,
  UpsertEmailInboundSettingsDto,
} from './email-inbound-admin.service';
import {
  BulkDeletePreTicketsDto,
  OpenPreTicketDto,
  PreTicketsService,
} from './pre-tickets.service';
import { cabecalhosDeArquivo } from '../../common/http/content-disposition';
import { ModuloPortal } from '../acesso/modulo-portal.decorator';

class UpdateEmailTemplateDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  subject?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  bodyHtml?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  bodyText?: string;
}

@Controller()
@UseGuards(RolesGuard)
export class EmailInboundController {
  constructor(
    private readonly admin: EmailInboundAdminService,
    private readonly preTickets: PreTicketsService,
    private readonly emailTemplates: EmailTemplatesService,
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
  updateRoute(
    @Param('id') id: string,
    @Body() dto: UpdateEmailInboundRouteDto,
  ) {
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

  @Get('admin/email/templates')
  @Roles(UserRole.ADMIN)
  listTemplates() {
    return this.emailTemplates.list();
  }

  @Patch('admin/email/templates/:key')
  @Roles(UserRole.ADMIN)
  updateTemplate(
    @Param('key') key: string,
    @Body() dto: UpdateEmailTemplateDto,
  ) {
    return this.emailTemplates.update(key, dto);
  }

  @ModuloPortal('pre-tickets')
  @Get('pre-tickets/count')
  @Roles(UserRole.ADMIN, UserRole.COLLABORATOR)
  count(@CurrentUser() actor: AuthenticatedRequestUser) {
    return this.preTickets.countPending(actor).then((count) => ({ count }));
  }

  @ModuloPortal('pre-tickets')
  @Get('pre-tickets')
  @Roles(UserRole.ADMIN, UserRole.COLLABORATOR)
  list(@CurrentUser() actor: AuthenticatedRequestUser, @Query('q') q?: string) {
    return this.preTickets.list(actor, q);
  }

  /**
   * Mesas para escolher ao abrir o pré-ticket.
   *
   * Fica aqui, com a mesma permissão das outras rotas de pré-ticket: quem
   * pode abrir precisa conseguir listar. As outras listas de mesa do portal
   * exigem módulo (Usuários ou criar ticket) que nem todo atendente tem —
   * e, como a mesa virou obrigatória, sem a lista ele ficaria travado.
   */
  @ModuloPortal('pre-tickets')
  @Get('pre-tickets/desks')
  @Roles(UserRole.ADMIN, UserRole.COLLABORATOR)
  desks() {
    return this.preTickets.listDesks();
  }

  @ModuloPortal('pre-tickets')
  @Get('pre-tickets/:id')
  @Roles(UserRole.ADMIN, UserRole.COLLABORATOR)
  getOne(
    @CurrentUser() actor: AuthenticatedRequestUser,
    @Param('id') id: string,
  ) {
    return this.preTickets.getOne(actor, id);
  }

  @ModuloPortal('pre-tickets')
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

  @ModuloPortal('pre-tickets')
  @Post('pre-tickets/bulk-delete')
  @Roles(UserRole.ADMIN, UserRole.COLLABORATOR)
  removeMany(
    @CurrentUser() actor: AuthenticatedRequestUser,
    @Body() dto: BulkDeletePreTicketsDto,
  ) {
    return this.preTickets.softDeleteMany(actor, dto.ids);
  }

  @ModuloPortal('pre-tickets')
  @Delete('pre-tickets/:id')
  @Roles(UserRole.ADMIN, UserRole.COLLABORATOR)
  remove(
    @CurrentUser() actor: AuthenticatedRequestUser,
    @Param('id') id: string,
  ) {
    return this.preTickets.softDelete(actor, id);
  }

  @ModuloPortal('pre-tickets')
  @Post('pre-tickets/:id/open')
  @Roles(UserRole.ADMIN, UserRole.COLLABORATOR)
  open(
    @CurrentUser() actor: AuthenticatedRequestUser,
    @Param('id') id: string,
    @Body() dto: OpenPreTicketDto,
  ) {
    return this.preTickets.openAsTicket(actor, id, dto);
  }

  /** Reserva o pré-ticket para quem vai atender (evita trabalho duplicado). */
  @ModuloPortal('pre-tickets')
  @Post('pre-tickets/:id/claim')
  @Roles(UserRole.ADMIN, UserRole.COLLABORATOR)
  claim(
    @CurrentUser() actor: AuthenticatedRequestUser,
    @Param('id') id: string,
  ) {
    return this.preTickets.claim(actor, id);
  }

  @ModuloPortal('pre-tickets')
  @Delete('pre-tickets/:id/claim')
  @Roles(UserRole.ADMIN, UserRole.COLLABORATOR)
  release(
    @CurrentUser() actor: AuthenticatedRequestUser,
    @Param('id') id: string,
  ) {
    return this.preTickets.release(actor, id);
  }
}
