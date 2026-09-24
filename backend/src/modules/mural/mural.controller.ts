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
import {
  CreateMuralNoteDto,
  ReagirMuralNoteDto,
  UpdateMuralNoteDto,
} from './mural.dto';
import { MuralService } from './mural.service';
import { ModuloPortal } from '../acesso/modulo-portal.decorator';

type AuthenticatedRequest = { user: AuthenticatedRequestUser };

/**
 * Mural de reconhecimento.
 *
 * Barrado por **papel**, não por módulo de permissão — mesma escolha da tela
 * de Plantão: colaborador não tem linha na matriz para módulo novo, e o guard
 * de módulo nega quem não tem linha. Aqui entra só a equipe interna; nenhum
 * perfil de cliente alcança estas rotas.
 */
@ModuloPortal('mural')
@Controller('mural')
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN, UserRole.COLLABORATOR)
export class MuralController {
  constructor(private readonly mural: MuralService) {}

  @Get('colegas')
  colegas() {
    return this.mural.colegas();
  }

  /** Mural do mês: quem o time mais reconheceu. Só ADMIN (diretoria). */
  @Get('do-mes')
  @Roles(UserRole.ADMIN)
  doMes(@Query('mes') mes?: string) {
    return this.mural.doMes(mes);
  }

  @Get('notes')
  listar(@Req() req: AuthenticatedRequest) {
    return this.mural.listar(req.user);
  }

  @Post('notes')
  criar(@Req() req: AuthenticatedRequest, @Body() body: CreateMuralNoteDto) {
    return this.mural.criar(req.user, body);
  }

  @Patch('notes/:id')
  atualizar(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateMuralNoteDto,
  ) {
    return this.mural.atualizar(req.user, id, body);
  }

  @Post('notes/:id/reacoes')
  reagir(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReagirMuralNoteDto,
  ) {
    return this.mural.reagir(req.user, id, body.emoji);
  }

  @Delete('notes/:id')
  remover(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.mural.remover(req.user, id);
  }
}
