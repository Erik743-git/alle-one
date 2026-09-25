import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { IsString, MaxLength } from 'class-validator';

import { ModuloPortal } from '../acesso/modulo-portal.decorator';
import type { AuthenticatedRequestUser } from '../auth/auth-request-user';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { FechamentoService } from './fechamento.service';

class ReabrirDto {
  @IsString()
  @MaxLength(2000)
  motivo!: string;
}

type Req = { user: AuthenticatedRequestUser };

/**
 * Apontamentos → Fechamento. Só admin. Fechar e reabrir são mutações de
 * admin: entram na auditoria pelo interceptor, além do histórico próprio.
 */
@ModuloPortal('apontamentos')
@Controller('fechamento')
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN)
export class FechamentoController {
  constructor(private readonly svc: FechamentoService) {}

  @Get()
  listar() {
    return this.svc.listar();
  }

  @Get(':ciclo')
  conferencia(@Param('ciclo') ciclo: string) {
    return this.svc.conferencia(ciclo);
  }

  @Post(':ciclo/fechar')
  fechar(@Req() req: Req, @Param('ciclo') ciclo: string) {
    return this.svc.fechar(req.user.userId, ciclo);
  }

  @Post(':ciclo/reabrir')
  reabrir(
    @Req() req: Req,
    @Param('ciclo') ciclo: string,
    @Body() dto: ReabrirDto,
  ) {
    return this.svc.reabrir(req.user.userId, ciclo, dto.motivo);
  }
}
