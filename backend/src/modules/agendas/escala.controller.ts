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
import { EscalaExcecaoDto, EscalaRegraDto } from './escala.dto';
import { EscalaService } from './escala.service';

type AuthenticatedRequest = { user: AuthenticatedRequestUser };

/**
 * Escala de atendimento (aba Escala de Agendas).
 *
 * Ver: toda a equipe interna — o NOC precisa saber a quem recorrer.
 * Cadastrar, trocar e dar folga: só ADMIN.
 *
 * Barrado por papel, não por módulo de permissão, como Plantão e Mural:
 * colaborador não tem linha na matriz para módulo novo.
 */
@Controller('agendas/escala')
@UseGuards(RolesGuard)
export class EscalaController {
  constructor(private readonly escala: EscalaService) {}

  @Get('dia')
  @Roles(UserRole.ADMIN, UserRole.COLLABORATOR)
  dia(@Query('data') data: string) {
    return this.escala.dia(data);
  }

  @Get('opcoes')
  @Roles(UserRole.ADMIN)
  opcoes() {
    return this.escala.opcoes();
  }

  @Get('regras')
  @Roles(UserRole.ADMIN)
  regras() {
    return this.escala.regras();
  }

  @Post('regras')
  @Roles(UserRole.ADMIN)
  criarRegra(@Req() req: AuthenticatedRequest, @Body() body: EscalaRegraDto) {
    return this.escala.criarRegra(req.user.userId, body);
  }

  @Patch('regras/:id')
  @Roles(UserRole.ADMIN)
  atualizarRegra(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: EscalaRegraDto,
  ) {
    return this.escala.atualizarRegra(id, body);
  }

  @Delete('regras/:id')
  @Roles(UserRole.ADMIN)
  removerRegra(@Param('id', ParseUUIDPipe) id: string) {
    return this.escala.removerRegra(id);
  }

  @Post('excecoes')
  @Roles(UserRole.ADMIN)
  registrarExcecao(
    @Req() req: AuthenticatedRequest,
    @Body() body: EscalaExcecaoDto,
  ) {
    return this.escala.registrarExcecao(req.user.userId, body);
  }

  @Delete('excecoes/:regraId/:date')
  @Roles(UserRole.ADMIN)
  removerExcecao(
    @Param('regraId', ParseUUIDPipe) regraId: string,
    @Param('date') date: string,
  ) {
    return this.escala.removerExcecao(regraId, date);
  }
}
