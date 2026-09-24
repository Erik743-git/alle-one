import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';

import type { AuthenticatedRequestUser } from '../auth/auth-request-user';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SalvarAcessoModuloDto } from './acesso.dto';
import { AcessoService } from './acesso.service';

type Req = { user: AuthenticatedRequestUser };

/**
 * Administração → Acesso por perfil. Só admin; a própria Administração não
 * está no catálogo. Mutação de admin entra na auditoria pelo interceptor.
 */
@Controller('admin/acesso-modulos')
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN)
export class AcessoController {
  constructor(private readonly acesso: AcessoService) {}

  @Get()
  listar() {
    return this.acesso.listar();
  }

  @Put()
  salvar(@Req() req: Req, @Body() dto: SalvarAcessoModuloDto) {
    return this.acesso.salvar(req.user.userId, dto);
  }
}
