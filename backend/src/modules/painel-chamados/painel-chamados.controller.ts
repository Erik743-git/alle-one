import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { Response } from 'express';

import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { lerBooleano, lerVisao } from './painel-chamados-regras';
import { PainelChamadosService } from './painel-chamados.service';

const XLSX =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Abas de admin em Apontamentos: "Chamados parados" e "Chamados por
 * responsável". Só admin — combinado com o Erik ("so admin (as duas telas
 * novas)").
 */
@Controller('painel-chamados')
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN)
export class PainelChamadosController {
  constructor(private readonly painel: PainelChamadosService) {}

  @Get('parados')
  parados(
    @Query('empresa') empresa?: string,
    @Query('responsavel') responsavel?: string,
    @Query('so48h') so48h?: string,
  ) {
    return this.painel.paradosFiltrados({
      empresa: empresa?.trim() || undefined,
      responsavel: responsavel?.trim() || undefined,
      so48h: lerBooleano(so48h),
    });
  }

  @Get('parados.xlsx')
  async paradosXlsx(
    @Res() res: Response,
    @Query('empresa') empresa?: string,
    @Query('responsavel') responsavel?: string,
    @Query('so48h') so48h?: string,
  ) {
    const buffer = await this.painel.planilhaParados({
      empresa: empresa?.trim() || undefined,
      responsavel: responsavel?.trim() || undefined,
      so48h: lerBooleano(so48h),
    });
    this.enviar(res, buffer, 'chamados-parados.xlsx');
  }

  @Get('responsaveis')
  resumo(
    @Query('visao') visao?: string,
    @Query('incluirFechados') incluirFechados?: string,
  ) {
    return this.painel.resumo(lerVisao(visao), lerBooleano(incluirFechados));
  }

  @Get('responsaveis/chamados')
  chamados(
    @Query('visao') visao?: string,
    @Query('chave') chave?: string,
    @Query('incluirFechados') incluirFechados?: string,
  ) {
    return this.painel.chamados(
      lerVisao(visao),
      chave?.trim() || null,
      lerBooleano(incluirFechados),
    );
  }

  @Get('responsaveis.xlsx')
  async chamadosXlsx(
    @Res() res: Response,
    @Query('visao') visao?: string,
    @Query('chave') chave?: string,
    @Query('incluirFechados') incluirFechados?: string,
  ) {
    const buffer = await this.painel.planilhaChamados(
      lerVisao(visao),
      chave?.trim() || null,
      lerBooleano(incluirFechados),
    );
    this.enviar(res, buffer, 'chamados-por-responsavel.xlsx');
  }

  private enviar(res: Response, buffer: Buffer, nome: string) {
    res.setHeader('Content-Type', XLSX);
    res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
    res.send(buffer);
  }
}
