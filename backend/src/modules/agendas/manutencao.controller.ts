import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedRequestUser } from '../auth/auth-request-user';
import { JanelaManutencaoDto } from './escala.dto';
import { ManutencaoService } from './manutencao.service';

type AuthenticatedRequest = { user: AuthenticatedRequestUser };

/**
 * Manutenção (aba de Agendas): janelas dos clientes e GMUDs por cima.
 *
 * Ver: equipe interna (as GMUDs seguem o escopo da tela de GMUD).
 * Cadastrar janela: só ADMIN — e entra na auditoria, como todo POST de admin.
 */
@Controller('agendas/manutencao')
@UseGuards(RolesGuard)
export class ManutencaoController {
  constructor(private readonly manutencao: ManutencaoService) {}

  @Get('calendario')
  @Roles(UserRole.ADMIN, UserRole.COLLABORATOR)
  calendario(
    @Req() req: AuthenticatedRequest,
    @Query('de') de: string,
    @Query('ate') ate: string,
    @Query('companyId', new ParseUUIDPipe({ optional: true }))
    companyId?: string,
  ) {
    return this.manutencao.calendario(req.user, de, ate, companyId);
  }

  @Get('janelas')
  @Roles(UserRole.ADMIN, UserRole.COLLABORATOR)
  janelas(
    @Query('companyId', new ParseUUIDPipe({ optional: true }))
    companyId?: string,
  ) {
    return this.manutencao.listarJanelas(companyId);
  }

  @Post('janelas')
  @Roles(UserRole.ADMIN)
  criarJanela(
    @Req() req: AuthenticatedRequest,
    @Body() body: JanelaManutencaoDto,
  ) {
    return this.manutencao.criarJanela(req.user.userId, body);
  }

  @Patch('janelas/:id')
  @Roles(UserRole.ADMIN)
  atualizarJanela(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: JanelaManutencaoDto,
  ) {
    return this.manutencao.atualizarJanela(id, body);
  }

  @Delete('janelas/:id')
  @Roles(UserRole.ADMIN)
  removerJanela(@Param('id', ParseUUIDPipe) id: string) {
    return this.manutencao.removerJanela(id);
  }
}
