import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PlantaoService } from './plantao.service';
import { ModuloPortal } from '../acesso/modulo-portal.decorator';

/**
 * Escala de plantão, só para consulta.
 *
 * Barrada por **papel**, não por módulo de permissão: colaborador não tem
 * linha na matriz de permissões para módulo novo, e o guard nega quem não tem
 * linha. Foi o que travou a lista de mesas do pré-ticket. Aqui vale a mesma
 * regra das rotas de pré-ticket — equipe interna entra, perfis de cliente não.
 */
@ModuloPortal('agendas')
@Controller('plantao')
@UseGuards(RolesGuard)
export class PlantaoController {
  constructor(private readonly plantao: PlantaoService) {}

  @Get('escalas')
  @Roles(UserRole.ADMIN, UserRole.COLLABORATOR)
  escalas(@Query('dias') dias?: string) {
    const n = Number(dias);
    return this.plantao.escalas({
      dias: Number.isFinite(n) && n > 0 ? n : undefined,
    });
  }
}
