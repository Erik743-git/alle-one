import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

function paraDia(valor: string | Date | null | undefined): string | null {
  if (!valor) return null;
  if (valor instanceof Date) {
    return Number.isNaN(valor.getTime())
      ? null
      : valor.toISOString().slice(0, 10);
  }
  const dia = valor.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(dia) ? dia : null;
}

function br(dia: string): string {
  return dia.split('-').reverse().join('/');
}

/**
 * Trava de ciclo fechado: apontamento com data dentro de um ciclo fechado não
 * é criado, editado nem apagado — por ninguém, admin inclusive. Para mexer, o
 * admin reabre o ciclo (com motivo, na auditoria).
 */
@Injectable()
export class PeriodoFechadoService {
  constructor(private readonly prisma: PrismaService) {}

  async assertAberto(
    datas: Array<string | Date | null | undefined>,
  ): Promise<void> {
    const dias = [
      ...new Set(datas.map(paraDia).filter((d): d is string => !!d)),
    ];
    for (const dia of dias) {
      const data = new Date(`${dia}T00:00:00.000Z`);
      const fechado = await this.prisma.fechamentoCiclo.findFirst({
        where: { fechado: true, inicio: { lte: data }, fim: { gte: data } },
        select: { inicio: true, fim: true },
      });
      if (fechado) {
        const ini = fechado.inicio.toISOString().slice(0, 10);
        const fim = fechado.fim.toISOString().slice(0, 10);
        throw new BadRequestException(
          `As horas de ${br(ini)} a ${br(fim)} estão fechadas. Para alterar o dia ${br(dia)}, um administrador precisa reabrir o ciclo em Apontamentos → Fechamento.`,
        );
      }
    }
  }
}
