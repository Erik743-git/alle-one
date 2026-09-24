import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  GmudStatus,
  JanelaManutencaoResponsavel,
  PermissionModule,
  type Prisma,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedRequestUser } from '../auth/auth-request-user';
import { gmudParticipationWhere } from '../gmud/gmud-access';
import { paraMinutos, somarDias } from './escala-dia';
import {
  diasDosTrechos,
  horaLocal,
  intervalosDaJanela,
  situacaoDaGmud,
  type Intervalo,
  type JanelaDef,
  type SituacaoGmud,
} from './manutencao-janela';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const YMD = /^\d{4}-\d{2}-\d{2}$/;
/** Calendário pede no máximo seis semanas: é uma visão, não um relatório. */
const MAX_DIAS_CALENDARIO = 42;
/** Janela avulsa maior que isto é quase sempre digitação errada. */
const MAX_DIAS_AVULSA = 31;
/** GMUD cancelada ou reprovada não vai acontecer: fora do calendário. */
const STATUS_FORA_DO_CALENDARIO: GmudStatus[] = [
  GmudStatus.CANCELED,
  GmudStatus.REJECTED,
];

function ymd(data: Date): string {
  return data.toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" para coluna @db.Date (meio-dia UTC: nunca vira a data). */
function paraData(valor: string): Date {
  return new Date(`${valor}T12:00:00.000Z`);
}

function exigirData(valor: string | null | undefined, campo: string): string {
  if (!valor || !YMD.test(valor) || Number.isNaN(paraData(valor).getTime())) {
    throw new BadRequestException(`${campo} precisa ser uma data válida.`);
  }
  return valor;
}

export type JanelaInput = {
  companyId: string;
  recorrente: boolean;
  daysOfWeek?: number[];
  startTime?: string | null;
  endTime?: string | null;
  validFrom?: string | null;
  validTo?: string | null;
  inicio?: string | null;
  fim?: string | null;
  responsavel: 'ALLE' | 'CLIENTE';
  observacoes?: string | null;
};

export type JanelaSaida = {
  id: string;
  companyId: string;
  companyName: string;
  recorrente: boolean;
  daysOfWeek: number[];
  startTime: string | null;
  endTime: string | null;
  validFrom: string | null;
  validTo: string | null;
  inicio: string | null;
  fim: string | null;
  responsavel: 'ALLE' | 'CLIENTE';
  observacoes: string | null;
};

export type TrechoGmud = {
  inicio: string;
  fim: string;
  tipo: 'ATIVIDADE' | 'INDISPONIBILIDADE';
};

export type GmudNoCalendario = {
  id: string;
  code: number;
  title: string;
  status: GmudStatus;
  companyId: string;
  companyName: string;
  trechos: TrechoGmud[];
  situacao: SituacaoGmud;
  /** Pedaços fora de toda janela (só quando situacao = FORA). */
  fora: Array<{ inicio: string; fim: string }>;
};

export type OcorrenciaJanela = {
  janelaId: string;
  companyId: string;
  companyName: string;
  responsavel: 'ALLE' | 'CLIENTE';
  observacoes: string | null;
  inicio: string;
  fim: string;
};

type JanelaRow = Prisma.JanelaManutencaoGetPayload<{
  include: { company: { select: { name: true } } };
}>;

function paraDef(row: {
  recorrente: boolean;
  daysOfWeek: number[];
  startTime: string | null;
  endTime: string | null;
  validFrom: Date | null;
  validTo: Date | null;
  inicio: Date | null;
  fim: Date | null;
}): JanelaDef {
  return {
    recorrente: row.recorrente,
    daysOfWeek: row.daysOfWeek,
    startTime: row.startTime,
    endTime: row.endTime,
    validFrom: row.validFrom ? ymd(row.validFrom) : null,
    validTo: row.validTo ? ymd(row.validTo) : null,
    inicio: row.inicio,
    fim: row.fim,
  };
}

function paraSaida(row: JanelaRow): JanelaSaida {
  return {
    id: row.id,
    companyId: row.companyId,
    companyName: row.company.name,
    recorrente: row.recorrente,
    daysOfWeek: row.daysOfWeek,
    startTime: row.startTime,
    endTime: row.endTime,
    validFrom: row.validFrom ? ymd(row.validFrom) : null,
    validTo: row.validTo ? ymd(row.validTo) : null,
    inicio: row.inicio?.toISOString() ?? null,
    fim: row.fim?.toISOString() ?? null,
    responsavel: row.responsavel,
    observacoes: row.observacoes,
  };
}

const iso = (i: Intervalo) => ({
  inicio: i.inicio.toISOString(),
  fim: i.fim.toISOString(),
});

/**
 * Manutenção: janelas combinadas com cada cliente e as GMUDs por cima.
 *
 * GMUD fora de toda janela da empresa aparece destacada — só aviso, nunca
 * bloqueio (decisão de 23/09: bloquear travaria emergência de madrugada).
 * A conta de dentro/fora mora em manutencao-janela.ts, pura e testada.
 */
@Injectable()
export class ManutencaoService {
  constructor(private readonly prisma: PrismaService) {}

  async listarJanelas(companyId?: string): Promise<JanelaSaida[]> {
    const rows = await this.prisma.janelaManutencao.findMany({
      where: { deletedAt: null, ...(companyId ? { companyId } : {}) },
      include: { company: { select: { name: true } } },
      orderBy: [{ company: { name: 'asc' } }, { createdAt: 'asc' }],
    });
    return rows.map(paraSaida);
  }

  async criarJanela(actorId: string, input: JanelaInput) {
    const dados = await this.validar(input);
    const row = await this.prisma.janelaManutencao.create({
      data: { ...dados, createdBy: actorId },
      include: { company: { select: { name: true } } },
    });
    return paraSaida(row);
  }

  async atualizarJanela(id: string, input: JanelaInput) {
    await this.exigirJanela(id);
    const dados = await this.validar(input);
    const row = await this.prisma.janelaManutencao.update({
      where: { id },
      data: dados,
      include: { company: { select: { name: true } } },
    });
    return paraSaida(row);
  }

  /** Tira a janela da agenda; fica no banco para o histórico. */
  async removerJanela(id: string) {
    await this.exigirJanela(id);
    await this.prisma.janelaManutencao.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { ok: true as const };
  }

  /**
   * Janelas e GMUDs entre `de` e `ate` (dias de Brasília, inclusive).
   *
   * GMUD segue a mesma regra da tela de GMUD: admin vê todas; colaborador
   * só as de que participa, e só se tiver o módulo GMUD liberado.
   */
  async calendario(
    user: AuthenticatedRequestUser,
    de: string,
    ate: string,
    companyId?: string,
  ): Promise<{
    de: string;
    ate: string;
    janelas: OcorrenciaJanela[];
    gmuds: GmudNoCalendario[];
  }> {
    exigirData(de, 'O início');
    exigirData(ate, 'O fim');
    if (ate < de) {
      throw new BadRequestException('O fim precisa ser depois do início.');
    }
    if (somarDias(de, MAX_DIAS_CALENDARIO - 1) < ate) {
      throw new BadRequestException(
        `Peça no máximo ${MAX_DIAS_CALENDARIO} dias por vez.`,
      );
    }

    const inicioPeriodo = horaLocal(de, 0);
    const fimPeriodo = horaLocal(somarDias(ate, 1), 0);

    const gmuds = this.podeVerGmuds(user)
      ? await this.buscarGmuds(user, inicioPeriodo, fimPeriodo, companyId)
      : [];

    // Sem filtro, todas as janelas (é uma semana: poucas ocorrências).
    const janelasRows = await this.prisma.janelaManutencao.findMany({
      where: { deletedAt: null, ...(companyId ? { companyId } : {}) },
      include: { company: { select: { name: true } } },
    });
    const porEmpresa = new Map<string, JanelaRow[]>();
    for (const row of janelasRows) {
      const lista = porEmpresa.get(row.companyId) ?? [];
      lista.push(row);
      porEmpresa.set(row.companyId, lista);
    }

    const ocorrencias: OcorrenciaJanela[] = janelasRows
      .flatMap((row) =>
        intervalosDaJanela(paraDef(row), de, ate)
          .filter((i) => i.fim > inicioPeriodo && i.inicio < fimPeriodo)
          .map((i) => ({
            janelaId: row.id,
            companyId: row.companyId,
            companyName: row.company.name,
            responsavel: row.responsavel,
            observacoes: row.observacoes,
            ...iso(i),
          })),
      )
      .sort((a, b) => a.inicio.localeCompare(b.inicio));

    const saida: GmudNoCalendario[] = gmuds
      .map((g) => {
        const trechos: Array<Intervalo & { tipo: TrechoGmud['tipo'] }> = [
          ...g.activities.map((a) => ({
            inicio: a.scheduledAt,
            fim: new Date(
              a.scheduledAt.getTime() + Math.max(1, a.durationMinutes) * 60_000,
            ),
            tipo: 'ATIVIDADE' as const,
          })),
          ...(g.downtime && g.downtimeStart && g.downtimeEnd
            ? [
                {
                  inicio: g.downtimeStart,
                  fim: g.downtimeEnd,
                  tipo: 'INDISPONIBILIDADE' as const,
                },
              ]
            : []),
        ].sort((a, b) => a.inicio.getTime() - b.inicio.getTime());

        const janelasDaEmpresa = porEmpresa.get(g.companyId) ?? [];
        const dias = diasDosTrechos(trechos);
        const intervalos = dias
          ? janelasDaEmpresa.flatMap((row) =>
              intervalosDaJanela(paraDef(row), dias.de, dias.ate),
            )
          : [];
        const { situacao, fora } = situacaoDaGmud(
          trechos,
          intervalos,
          janelasDaEmpresa.length > 0,
        );
        return {
          id: g.id,
          code: g.code,
          title: g.title,
          status: g.status,
          companyId: g.companyId,
          companyName: g.company.name,
          trechos: trechos.map((t) => ({ ...iso(t), tipo: t.tipo })),
          situacao,
          fora: fora.map(iso),
        };
      })
      .sort((a, b) =>
        (a.trechos[0]?.inicio ?? '').localeCompare(b.trechos[0]?.inicio ?? ''),
      );

    return { de, ate, janelas: ocorrencias, gmuds: saida };
  }

  // --- internos -------------------------------------------------------------

  private podeVerGmuds(user: AuthenticatedRequestUser): boolean {
    if (user.role === 'ADMIN') return true;
    return user.permissions.some(
      (p) => p.module === PermissionModule.GMUD && p.canView,
    );
  }

  /** GMUDs com atividade ou indisponibilidade no período. */
  private buscarGmuds(
    user: AuthenticatedRequestUser,
    inicio: Date,
    fim: Date,
    companyId?: string,
  ) {
    // Atividade longa que começou antes do período ainda pode cair nele.
    const folga = new Date(inicio.getTime() - 2 * 24 * 60 * 60_000);
    return this.prisma.gmud.findMany({
      where: {
        deletedAt: null,
        status: { notIn: STATUS_FORA_DO_CALENDARIO },
        ...(companyId ? { companyId } : {}),
        ...(user.role === 'ADMIN' ? {} : gmudParticipationWhere(user.userId)),
        AND: [
          {
            OR: [
              {
                activities: {
                  some: {
                    deletedAt: null,
                    scheduledAt: { gte: folga, lt: fim },
                  },
                },
              },
              {
                downtime: true,
                downtimeStart: { lt: fim },
                downtimeEnd: { gt: inicio },
              },
            ],
          },
        ],
      },
      select: {
        id: true,
        code: true,
        title: true,
        status: true,
        companyId: true,
        company: { select: { name: true } },
        downtime: true,
        downtimeStart: true,
        downtimeEnd: true,
        activities: {
          where: { deletedAt: null },
          select: { scheduledAt: true, durationMinutes: true },
          orderBy: { scheduledAt: 'asc' },
        },
      },
      take: 500,
    });
  }

  private async validar(input: JanelaInput) {
    const empresa = await this.prisma.company.findFirst({
      where: { id: input.companyId, deletedAt: null },
      select: { id: true },
    });
    if (!empresa) throw new NotFoundException('Empresa não encontrada.');

    const observacoes = input.observacoes?.trim() || null;
    const responsavel =
      input.responsavel === 'CLIENTE'
        ? JanelaManutencaoResponsavel.CLIENTE
        : JanelaManutencaoResponsavel.ALLE;

    if (input.recorrente) {
      const dias = [...new Set(input.daysOfWeek ?? [])].sort();
      if (dias.length === 0) {
        throw new BadRequestException('Escolha ao menos um dia da semana.');
      }
      if (!input.startTime || !HHMM.test(input.startTime)) {
        throw new BadRequestException('Início no formato HH:MM.');
      }
      if (!input.endTime || !HHMM.test(input.endTime)) {
        throw new BadRequestException('Fim no formato HH:MM.');
      }
      if (paraMinutos(input.startTime) === paraMinutos(input.endTime)) {
        throw new BadRequestException('A janela precisa ter duração.');
      }
      const validFrom = input.validFrom
        ? exigirData(input.validFrom, 'O início da validade')
        : null;
      const validTo = input.validTo
        ? exigirData(input.validTo, 'O fim da validade')
        : null;
      if (validFrom && validTo && validTo < validFrom) {
        throw new BadRequestException(
          'O fim da validade precisa ser depois do início.',
        );
      }
      return {
        companyId: input.companyId,
        recorrente: true,
        daysOfWeek: dias,
        startTime: input.startTime,
        endTime: input.endTime,
        validFrom: validFrom ? paraData(validFrom) : null,
        validTo: validTo ? paraData(validTo) : null,
        inicio: null,
        fim: null,
        responsavel,
        observacoes,
      };
    }

    const inicio = input.inicio ? new Date(input.inicio) : null;
    const fim = input.fim ? new Date(input.fim) : null;
    if (!inicio || !fim || isNaN(inicio.getTime()) || isNaN(fim.getTime())) {
      throw new BadRequestException('Informe início e fim da janela.');
    }
    if (fim <= inicio) {
      throw new BadRequestException('O fim precisa ser depois do início.');
    }
    if (fim.getTime() - inicio.getTime() > MAX_DIAS_AVULSA * 86_400_000) {
      throw new BadRequestException(
        `Janela avulsa de no máximo ${MAX_DIAS_AVULSA} dias.`,
      );
    }
    return {
      companyId: input.companyId,
      recorrente: false,
      daysOfWeek: [],
      startTime: null,
      endTime: null,
      validFrom: null,
      validTo: null,
      inicio,
      fim,
      responsavel,
      observacoes,
    };
  }

  private async exigirJanela(id: string) {
    const janela = await this.prisma.janelaManutencao.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!janela) throw new NotFoundException('Janela não encontrada.');
  }
}
