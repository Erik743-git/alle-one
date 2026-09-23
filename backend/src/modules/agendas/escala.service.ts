import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EscalaExcecaoTipo, UserRole, UserStatus } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import {
  paraMinutos,
  problemaNaExcecao,
  somarDias,
  turnosDoDia,
  type EscalaExcecaoDia,
  type EscalaRegraDia,
  type TurnoDia,
} from './escala-dia';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** Date do Prisma (@db.Date) para "YYYY-MM-DD", sem passar por fuso. */
function ymd(data: Date): string {
  return data.toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" para Date de coluna @db.Date (meio-dia UTC: nunca vira a data). */
function paraData(valor: string): Date {
  return new Date(`${valor}T12:00:00.000Z`);
}

function exigirHora(valor: string, campo: string) {
  if (!HHMM.test(valor)) {
    throw new BadRequestException(`${campo} precisa estar no formato HH:MM.`);
  }
}

function exigirData(valor: string, campo: string) {
  if (!YMD.test(valor) || Number.isNaN(paraData(valor).getTime())) {
    throw new BadRequestException(`${campo} precisa ser uma data válida.`);
  }
}

export type RegraInput = {
  userId: string;
  specialtyId: string;
  startTime: string;
  endTime: string;
  daysOfWeek: number[];
  validFrom: string;
  validTo?: string | null;
};

export type ExcecaoInput = {
  regraId: string;
  date: string;
  tipo: 'FOLGA' | 'TROCA';
  substituteUserId?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  motivo?: string | null;
};

/**
 * Escala de atendimento: quem responde por hora, por especialidade.
 *
 * A conta de "quem está de turno" mora em escala-dia.ts, pura e testada.
 * Aqui só se busca o que ela precisa e se valida o que entra.
 */
@Injectable()
export class EscalaService {
  constructor(private readonly prisma: PrismaService) {}

  /** Turnos de um dia, já com folgas e trocas aplicadas. */
  async dia(data: string): Promise<{ data: string; turnos: TurnoDia[] }> {
    exigirData(data, 'A data');
    const vespera = somarDias(data, -1);

    const [regras, excecoes] = await Promise.all([
      this.prisma.escalaRegra.findMany({
        where: {
          deletedAt: null,
          // Só o que pode valer na véspera ou hoje; o resto nem sai do banco.
          validFrom: { lte: paraData(data) },
          OR: [{ validTo: null }, { validTo: { gte: paraData(vespera) } }],
        },
        include: {
          user: { select: { name: true } },
          specialty: { select: { name: true } },
        },
      }),
      this.prisma.escalaExcecao.findMany({
        where: { date: { in: [paraData(vespera), paraData(data)] } },
        include: { substituto: { select: { name: true } } },
      }),
    ]);

    const regrasDia: EscalaRegraDia[] = regras.map((r) => ({
      id: r.id,
      userId: r.userId,
      userName: r.user.name,
      specialtyName: r.specialty.name,
      startTime: r.startTime,
      endTime: r.endTime,
      daysOfWeek: r.daysOfWeek,
      validFrom: ymd(r.validFrom),
      validTo: r.validTo ? ymd(r.validTo) : null,
    }));

    const excecoesDia: EscalaExcecaoDia[] = excecoes.map((e) => ({
      id: e.id,
      regraId: e.regraId,
      date: ymd(e.date),
      tipo: e.tipo,
      substituteUserId: e.substituteUserId,
      substituteName: e.substituto?.name ?? null,
      startTime: e.startTime,
      endTime: e.endTime,
      motivo: e.motivo,
    }));

    return { data, turnos: turnosDoDia(data, regrasDia, excecoesDia) };
  }

  /** Pessoas e especialidades para os formulários do admin. */
  async opcoes() {
    const [pessoas, especialidades] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          deletedAt: null,
          status: UserStatus.ACTIVE,
          role: { in: [UserRole.ADMIN, UserRole.COLLABORATOR] },
        },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.specialty.findMany({
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    ]);
    return { pessoas, especialidades };
  }

  async regras() {
    const regras = await this.prisma.escalaRegra.findMany({
      where: { deletedAt: null },
      include: {
        user: { select: { name: true } },
        specialty: { select: { name: true } },
      },
      orderBy: [{ startTime: 'asc' }],
    });
    return regras.map((r) => ({
      id: r.id,
      userId: r.userId,
      userName: r.user.name,
      specialtyId: r.specialtyId,
      specialtyName: r.specialty.name,
      startTime: r.startTime,
      endTime: r.endTime,
      daysOfWeek: r.daysOfWeek,
      validFrom: ymd(r.validFrom),
      validTo: r.validTo ? ymd(r.validTo) : null,
    }));
  }

  private validarRegra(input: RegraInput) {
    exigirHora(input.startTime, 'O início');
    exigirHora(input.endTime, 'O fim');
    if (input.startTime === input.endTime) {
      throw new BadRequestException(
        'Início e fim iguais não formam turno. Para 24 horas, use 00:00 às 23:59.',
      );
    }
    const dias = [...new Set(input.daysOfWeek)];
    if (dias.length === 0 || dias.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
      throw new BadRequestException('Escolha pelo menos um dia da semana.');
    }
    exigirData(input.validFrom, 'O início da validade');
    if (input.validTo) {
      exigirData(input.validTo, 'O fim da validade');
      if (input.validTo < input.validFrom) {
        throw new BadRequestException(
          'O fim da validade não pode ser antes do início.',
        );
      }
    }
    return dias.sort();
  }

  async criarRegra(actorId: string, input: RegraInput) {
    const dias = this.validarRegra(input);
    const criada = await this.prisma.escalaRegra.create({
      data: {
        userId: input.userId,
        specialtyId: input.specialtyId,
        startTime: input.startTime,
        endTime: input.endTime,
        daysOfWeek: dias,
        validFrom: paraData(input.validFrom),
        validTo: input.validTo ? paraData(input.validTo) : null,
        createdBy: actorId,
      },
    });
    return { id: criada.id };
  }

  async atualizarRegra(id: string, input: RegraInput) {
    const dias = this.validarRegra(input);
    await this.exigirRegra(id);
    await this.prisma.escalaRegra.update({
      where: { id },
      data: {
        userId: input.userId,
        specialtyId: input.specialtyId,
        startTime: input.startTime,
        endTime: input.endTime,
        daysOfWeek: dias,
        validFrom: paraData(input.validFrom),
        validTo: input.validTo ? paraData(input.validTo) : null,
      },
    });
    return { ok: true as const };
  }

  /** Tira a regra da escala; o histórico (e as exceções) ficam no banco. */
  async removerRegra(id: string) {
    await this.exigirRegra(id);
    await this.prisma.escalaRegra.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return { ok: true as const };
  }

  /**
   * Folga ou troca num dia. Uma exceção por regra e dia: registrar de novo
   * substitui a anterior, em vez de empilhar duas trocas no mesmo turno.
   */
  async registrarExcecao(actorId: string, input: ExcecaoInput) {
    exigirData(input.date, 'O dia');
    const regra = await this.exigirRegra(input.regraId);

    const recortado = Boolean(input.startTime || input.endTime);
    if (recortado) {
      if (!input.startTime || !input.endTime) {
        throw new BadRequestException(
          'Para recortar o turno, informe o início e o fim do recorte.',
        );
      }
      exigirHora(input.startTime, 'O início do recorte');
      exigirHora(input.endTime, 'O fim do recorte');
      if (paraMinutos(input.startTime) === paraMinutos(input.endTime)) {
        throw new BadRequestException('O recorte precisa ter duração.');
      }
    }

    if (input.tipo === 'TROCA' && !input.substituteUserId) {
      throw new BadRequestException('Na troca, escolha quem assume o turno.');
    }

    const problema = problemaNaExcecao(
      {
        startTime: regra.startTime,
        endTime: regra.endTime,
        daysOfWeek: regra.daysOfWeek,
        validFrom: ymd(regra.validFrom),
        validTo: regra.validTo ? ymd(regra.validTo) : null,
      },
      input.date,
      recortado ? (input.startTime ?? null) : null,
      recortado ? (input.endTime ?? null) : null,
    );
    if (problema) throw new BadRequestException(problema);

    const data = paraData(input.date);
    await this.prisma.$transaction([
      this.prisma.escalaExcecao.deleteMany({
        where: { regraId: input.regraId, date: data },
      }),
      this.prisma.escalaExcecao.create({
        data: {
          regraId: input.regraId,
          date: data,
          tipo:
            input.tipo === 'TROCA'
              ? EscalaExcecaoTipo.TROCA
              : EscalaExcecaoTipo.FOLGA,
          substituteUserId:
            input.tipo === 'TROCA' ? (input.substituteUserId ?? null) : null,
          startTime: recortado ? (input.startTime ?? null) : null,
          endTime: recortado ? (input.endTime ?? null) : null,
          motivo: input.motivo?.trim() || null,
          createdBy: actorId,
        },
      }),
    ]);
    return { ok: true as const };
  }

  /** Desfaz a folga ou troca: o turno volta a ser de quem é pela regra. */
  async removerExcecao(regraId: string, date: string) {
    exigirData(date, 'O dia');
    await this.prisma.escalaExcecao.deleteMany({
      where: { regraId, date: paraData(date) },
    });
    return { ok: true as const };
  }

  private async exigirRegra(id: string) {
    const regra = await this.prisma.escalaRegra.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        startTime: true,
        endTime: true,
        daysOfWeek: true,
        validFrom: true,
        validTo: true,
      },
    });
    if (!regra) throw new NotFoundException('Regra de escala não encontrada.');
    return regra;
  }
}
