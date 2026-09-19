import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PermissionModule } from '@prisma/client';
import { Public } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ModulePermissionGuard } from '../auth/guards/module-permission.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { TicketSatisfactionService } from './ticket-satisfaction.service';
import { TicketSatisfactionReportService } from './ticket-satisfaction-report.service';

/**
 * Resposta da pesquisa: aberta, pelo token do e-mail.
 *
 * Sem login de propósito — o cliente responde em um clique, direto do
 * e-mail de fechamento. O token identifica o chamado e o solicitante, então
 * a resposta não é anônima para nós, só não exige senha.
 */
@ApiTags('Satisfação')
@Controller('satisfacao')
export class TicketSatisfactionPublicController {
  constructor(private readonly service: TicketSatisfactionService) {}

  @Public()
  @Get(':token')
  obter(@Param('token') token: string) {
    return this.service.obterPorToken(token);
  }

  @Public()
  @Post(':token')
  responder(
    @Param('token') token: string,
    @Body() body: { rating: number; comment?: string; channel?: string },
  ) {
    return this.service.responder(token, {
      rating: Number(body?.rating),
      comment: body?.comment,
      channel: body?.channel === 'PORTAL' ? 'PORTAL' : 'EMAIL',
    });
  }
}

/** Painel de satisfação: número, gráficos e ranking. */
@ApiTags('Satisfação')
@ApiBearerAuth()
@Controller('satisfacao/painel')
@UseGuards(JwtAuthGuard, RolesGuard, ModulePermissionGuard)
export class TicketSatisfactionAdminController {
  constructor(private readonly report: TicketSatisfactionReportService) {}

  @Get('resumo')
  @Roles('ADMIN', 'COLLABORATOR')
  @RequirePermission(PermissionModule.REPORTS, 'canView')
  resumo(@Query('de') de?: string, @Query('ate') ate?: string) {
    return this.report.resumo({ de, ate });
  }

  @Get('respostas')
  @Roles('ADMIN', 'COLLABORATOR')
  @RequirePermission(PermissionModule.REPORTS, 'canView')
  respostas(
    @Query('de') de?: string,
    @Query('ate') ate?: string,
    @Query('limit') limit?: string,
  ) {
    return this.report.respostas({
      de,
      ate,
      limit: limit ? Number(limit) : undefined,
    });
  }
}
