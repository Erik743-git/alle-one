import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
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
} from './tickets-create.dto';
import { TicketsListQueryDto } from './tickets.dto';
import { TicketsService } from './tickets.service';

@ApiTags('Tickets')
@ApiBearerAuth()
@Controller('tickets')
@UseGuards(JwtAuthGuard, ModulePermissionGuard, RolesGuard)
@Roles('ADMIN')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Get()
  @RequirePermission(PermissionModule.TICKETS, 'canView')
  list(
    @CurrentUser() actor: AuthenticatedRequestUser,
    @Query() query: TicketsListQueryDto,
  ) {
    return this.ticketsService.listGrouped(actor, query);
  }

  @Get('catalogs/filters')
  @RequirePermission(PermissionModule.TICKETS, 'canView')
  filterCatalogs() {
    return this.ticketsService.getFilterCatalogs();
  }

  @Get('catalogs/create')
  @RequirePermission(PermissionModule.TICKETS, 'canCreate')
  createCatalogs(@Query('deskId') deskIdRaw?: string) {
    const deskId =
      deskIdRaw != null && deskIdRaw.trim() !== ''
        ? Number(deskIdRaw)
        : undefined;
    return this.ticketsService.getCreateCatalogs(
      deskId != null && Number.isFinite(deskId) ? deskId : undefined,
    );
  }

  @Get('attachments/:fileId')
  @RequirePermission(PermissionModule.TICKETS, 'canView')
  async downloadAttachment(
    @Param('fileId') fileId: string,
    @Query('inline') inline?: string,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const { stream, meta } = await this.ticketsService.downloadPortalAttachment(
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

  @Post()
  @RequirePermission(PermissionModule.TICKETS, 'canCreate')
  create(
    @CurrentUser() actor: AuthenticatedRequestUser,
    @Body() body: CreateTicketDto,
  ) {
    return this.ticketsService.createTicket(actor, body);
  }

  @Get(':ticketNumber/catalogs/appointment')
  @RequirePermission(PermissionModule.TICKETS, 'canCreate')
  appointmentCatalogs(@Param('ticketNumber', ParseIntPipe) ticketNumber: number) {
    return this.ticketsService.getAppointmentCatalogs(ticketNumber);
  }

  @Get(':ticketNumber')
  @RequirePermission(PermissionModule.TICKETS, 'canView')
  detail(@Param('ticketNumber', ParseIntPipe) ticketNumber: number) {
    return this.ticketsService.getDetail(ticketNumber);
  }

  @Post(':ticketNumber/appointments')
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
        Object.values(first.constraints ?? {})[0] ?? 'Dados do apontamento inválidos.';
      throw new BadRequestException(msg);
    }

    return this.ticketsService.createAppointment(
      actor,
      ticketNumber,
      dto,
      files ?? [],
    );
  }
}
