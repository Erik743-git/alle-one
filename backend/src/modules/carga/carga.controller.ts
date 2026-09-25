import { Controller, Get, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { ModuloPortal } from '../acesso/modulo-portal.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CargaService } from './carga.service';

/**
 * Apontamentos → Carga da equipe. Admin sempre; colaborador só se o admin
 * liberar "Carga da equipe" em Acesso por perfil (a tabela decide).
 */
@ModuloPortal('carga-equipe')
@Controller('carga-equipe')
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN, UserRole.COLLABORATOR)
export class CargaController {
  constructor(private readonly svc: CargaService) {}

  @Get()
  carga() {
    return this.svc.carga();
  }
}
