import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedRequestUser } from '../gmud/gmud.types';
import { CompaniesService } from './companies.service';

/**
 * Dados da empresa do usuário logado (Dashboard, GMUD, etc.)
 * sem exigir permissão do módulo COMPANIES / papel ADMIN.
 */
@ApiTags('Companies')
@ApiBearerAuth()
@Controller('companies/session')
@UseGuards(JwtAuthGuard)
export class CompaniesSessionController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Get('mine')
  mine(@CurrentUser() user: AuthenticatedRequestUser) {
    if (!user.companyId) {
      throw new NotFoundException('Usuário sem empresa vinculada');
    }

    return this.companiesService.findOne(user.companyId);
  }

  /**
   * Lista empresas para troca no dashboard por equipe interna (ex.: Colaborador).
   * Não expõe endpoints administrativos de gestão de empresas.
   */
  @Get('accessible')
  async accessible(@CurrentUser() user: AuthenticatedRequestUser) {
    if (user.role !== 'ADMIN' && user.role !== 'COLLABORATOR') {
      throw new ForbiddenException('Acesso negado.');
    }

    return this.companiesService.findAll();
  }
}
