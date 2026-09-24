import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import {
  cicloAnterior,
  cicloDoDia,
  cicloEncerrado,
  cicloValido,
  conferir,
  diaBrasilia,
  limitesDoCiclo,
  type ApontamentoConferencia,
} from './fechamento-regras';

const CICLOS_NA_LISTA = 12;
const MOTIVO_MINIMO = 10;

@Injectable()
export class FechamentoService {
  constructor(private readonly prisma: PrismaService) {}

  private validar(ciclo: string) {
    if (!cicloValido(ciclo))
      throw new BadRequestException('Ciclo inválido (use AAAA-MM).');
  }

  /** Últimos 12 ciclos (o atual, em andamento, primeiro) com o estado. */
  async listar(agora = new Date()) {
    const hoje = diaBrasilia(agora);
    const ciclos: string[] = [];
    let c = cicloDoDia(hoje);
    for (let i = 0; i < CICLOS_NA_LISTA; i++) {
      ciclos.push(c);
      c = cicloAnterior(c);
    }
    const linhas = await this.prisma.fechamentoCiclo.findMany({
      where: { ciclo: { in: ciclos } },
      select: {
        ciclo: true,
        fechado: true,
        fechadoEm: true,
        eventos: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { acao: true, createdAt: true, userId: true, motivo: true },
        },
      },
    });
    const porCiclo = new Map(linhas.map((l) => [l.ciclo, l]));
    const ids = [
      ...new Set(linhas.flatMap((l) => l.eventos.map((e) => e.userId))),
    ];
    const nomes = new Map(
      (
        await this.prisma.user.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true },
        })
      ).map((u) => [u.id, u.name]),
    );
    return ciclos.map((ciclo) => {
      const l = porCiclo.get(ciclo);
      const ultimo = l?.eventos[0];
      return {
        ciclo,
        ...limitesDoCiclo(ciclo),
        encerrado: cicloEncerrado(ciclo, hoje),
        fechado: l?.fechado ?? false,
        ultimoEvento: ultimo
          ? {
              acao: ultimo.acao,
              em: ultimo.createdAt.toISOString(),
              por: nomes.get(ultimo.userId) ?? '—',
              motivo: ultimo.motivo,
            }
          : null,
      };
    });
  }

  /** Apontamentos do ciclo (portal) com o que precisa de conferência. */
  async conferencia(ciclo: string) {
    this.validar(ciclo);
    const { inicio, fim } = limitesDoCiclo(ciclo);
    const linhas = await this.prisma.portalTicketAppointment.findMany({
      where: {
        appointmentDate: {
          gte: new Date(`${inicio}T00:00:00.000Z`),
          lte: new Date(`${fim}T00:00:00.000Z`),
        },
      },
      select: {
        id: true,
        ticketNumber: true,
        appointmentDate: true,
        initTime: true,
        endTime: true,
        serviceName: true,
        createdAt: true,
        createdBy: true,
        creator: { select: { name: true, role: true } },
      },
    });
    // Só horas da equipe: comunicação de cliente não entra na folha.
    const daEquipe = linhas.filter((l) =>
      ['ADMIN', 'COLLABORATOR', 'PJ'].includes(l.creator.role),
    );
    const entrada: ApontamentoConferencia[] = daEquipe.map((l) => ({
      id: l.id,
      userId: l.createdBy,
      nome: l.creator.name,
      ticketNumber: l.ticketNumber,
      data: l.appointmentDate.toISOString().slice(0, 10),
      inicio: l.initTime,
      fim: l.endTime,
      servico: l.serviceName,
      criadoEm: l.createdAt,
    }));
    const achados = conferir(entrada);
    const resumo = {
      SOBREPOSICAO: 0,
      DIA_LONGO: 0,
      FIM_DE_SEMANA: 0,
      LANCADO_DEPOIS: 0,
    };
    for (const a of achados) resumo[a.tipo] += 1;
    const historico = await this.prisma.fechamentoEvento.findMany({
      where: { ciclo },
      orderBy: { createdAt: 'desc' },
      select: {
        acao: true,
        motivo: true,
        pendencias: true,
        createdAt: true,
        userId: true,
      },
    });
    const nomes = new Map(
      (
        await this.prisma.user.findMany({
          where: { id: { in: [...new Set(historico.map((h) => h.userId))] } },
          select: { id: true, name: true },
        })
      ).map((u) => [u.id, u.name]),
    );
    return {
      ciclo,
      inicio,
      fim,
      apontamentos: entrada.length,
      pessoas: new Set(entrada.map((e) => e.userId)).size,
      resumo,
      achados,
      historico: historico.map((h) => ({
        acao: h.acao,
        motivo: h.motivo,
        pendencias: h.pendencias,
        em: h.createdAt.toISOString(),
        por: nomes.get(h.userId) ?? '—',
      })),
    };
  }

  async fechar(adminId: string, ciclo: string, agora = new Date()) {
    this.validar(ciclo);
    if (!cicloEncerrado(ciclo, diaBrasilia(agora))) {
      throw new BadRequestException(
        'Só dá para fechar um ciclo depois do dia 25.',
      );
    }
    const { inicio, fim } = limitesDoCiclo(ciclo);
    const pendencias = (await this.conferencia(ciclo)).achados.length;
    await this.prisma.$transaction(async (tx) => {
      const atual = await tx.fechamentoCiclo.findUnique({ where: { ciclo } });
      if (atual?.fechado)
        throw new BadRequestException('Este ciclo já está fechado.');
      await tx.fechamentoCiclo.upsert({
        where: { ciclo },
        create: {
          ciclo,
          inicio: new Date(`${inicio}T00:00:00.000Z`),
          fim: new Date(`${fim}T00:00:00.000Z`),
          fechado: true,
          fechadoEm: agora,
          fechadoPor: adminId,
        },
        update: { fechado: true, fechadoEm: agora, fechadoPor: adminId },
      });
      await tx.fechamentoEvento.create({
        data: { ciclo, acao: 'FECHOU', pendencias, userId: adminId },
      });
    });
    return this.conferencia(ciclo);
  }

  async reabrir(adminId: string, ciclo: string, motivo: string) {
    this.validar(ciclo);
    const texto = (motivo ?? '').trim();
    if (texto.length < MOTIVO_MINIMO) {
      throw new BadRequestException(
        `Escreva o motivo da reabertura (mínimo de ${MOTIVO_MINIMO} caracteres).`,
      );
    }
    await this.prisma.$transaction(async (tx) => {
      const atual = await tx.fechamentoCiclo.findUnique({ where: { ciclo } });
      if (!atual) throw new NotFoundException('Este ciclo nunca foi fechado.');
      if (!atual.fechado)
        throw new BadRequestException('Este ciclo já está aberto.');
      await tx.fechamentoCiclo.update({
        where: { ciclo },
        data: { fechado: false },
      });
      await tx.fechamentoEvento.create({
        data: {
          ciclo,
          acao: 'REABRIU',
          motivo: texto.slice(0, 2000),
          userId: adminId,
        },
      });
    });
    return this.conferencia(ciclo);
  }
}
