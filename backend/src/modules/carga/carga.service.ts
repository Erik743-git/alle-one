import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { getEffectiveRendimentoSchedule } from '../users/user-rendimento-schedule.helper';
import { estaParado, minutosTrabalhados, semanaAtual } from './carga-regras';

const SEM_MESA = 'Sem mesa';
const PARADOS_POR_PESSOA = 10;

type Parado = { ticketNumber: number; titulo: string | null; dias: number };

/**
 * Carga da equipe: por técnico e por mesa, os chamados abertos e parados
 * (48 h sem movimento) e as horas da semana contra a jornada. O responsável
 * do chamado é ligado ao usuário pelo nome, como no Correio.
 */
@Injectable()
export class CargaService {
  constructor(private readonly prisma: PrismaService) {}

  async carga(agora = new Date()) {
    const semana = semanaAtual(agora);
    const [pessoas, abertos] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          deletedAt: null,
          status: 'ACTIVE',
          role: { in: ['COLLABORATOR', 'PJ'] },
        },
        select: {
          id: true,
          name: true,
          role: true,
          rendimentoCustomSchedule: true,
          rendimentoDailyWorkMinutes: true,
          rendimentoLunchMinutes: true,
          specialty: { select: { name: true } },
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.portalTicket.findMany({
        where: { isClosed: false },
        select: {
          ticketNumber: true,
          title: true,
          responsibleName: true,
          deskName: true,
          updatedAtSource: true,
          updatedAt: true,
        },
      }),
    ]);

    const porNome = new Map(
      pessoas.map((p) => [p.name.trim().toLowerCase(), p.id]),
    );
    const apontamentos = await this.prisma.portalTicketAppointment.findMany({
      where: {
        createdBy: { in: pessoas.map((p) => p.id) },
        appointmentDate: {
          gte: new Date(`${semana.inicio}T00:00:00.000Z`),
          lte: new Date(`${semana.fim}T00:00:00.000Z`),
        },
      },
      select: {
        createdBy: true,
        appointmentDate: true,
        initTime: true,
        endTime: true,
      },
    });
    const apPorPessoa = new Map<
      string,
      Array<{ data: string; inicio: string | null; fim: string | null }>
    >();
    for (const a of apontamentos) {
      const lista = apPorPessoa.get(a.createdBy) ?? [];
      lista.push({
        data: a.appointmentDate.toISOString().slice(0, 10),
        inicio: a.initTime,
        fim: a.endTime,
      });
      apPorPessoa.set(a.createdBy, lista);
    }

    const chamadosPorPessoa = new Map<
      string,
      { abertos: number; parados: Parado[] }
    >();
    const semResponsavelPorMesa = new Map<string, number>();
    const paradosPorMesa = new Map<string, number>();
    const abertosPorMesa = new Map<string, number>();
    let semResponsavel = 0;
    for (const t of abertos) {
      const mov = t.updatedAtSource ?? t.updatedAt;
      const parado = estaParado(mov, agora);
      const mesa = t.deskName?.trim() || SEM_MESA;
      abertosPorMesa.set(mesa, (abertosPorMesa.get(mesa) ?? 0) + 1);
      if (parado) paradosPorMesa.set(mesa, (paradosPorMesa.get(mesa) ?? 0) + 1);
      const userId = t.responsibleName
        ? porNome.get(t.responsibleName.trim().toLowerCase())
        : undefined;
      if (!userId) {
        if (!t.responsibleName?.trim()) {
          semResponsavel += 1;
          semResponsavelPorMesa.set(
            mesa,
            (semResponsavelPorMesa.get(mesa) ?? 0) + 1,
          );
        }
        continue;
      }
      const c = chamadosPorPessoa.get(userId) ?? { abertos: 0, parados: [] };
      c.abertos += 1;
      if (parado && mov) {
        c.parados.push({
          ticketNumber: t.ticketNumber,
          titulo: t.title,
          dias: Math.floor((agora.getTime() - mov.getTime()) / 86_400_000),
        });
      }
      chamadosPorPessoa.set(userId, c);
    }

    const linhas = pessoas.map((p) => {
      const jornadaDia = getEffectiveRendimentoSchedule(p).dailyWorkMinutes;
      const c = chamadosPorPessoa.get(p.id) ?? { abertos: 0, parados: [] };
      const minutos = minutosTrabalhados(apPorPessoa.get(p.id) ?? []);
      const esperado = jornadaDia * semana.diasUteisAteHoje;
      return {
        userId: p.id,
        nome: p.name,
        papel: p.role,
        mesa: p.specialty?.name ?? SEM_MESA,
        abertos: c.abertos,
        parados: c.parados.length,
        chamadosParados: c.parados
          .sort((a, b) => b.dias - a.dias)
          .slice(0, PARADOS_POR_PESSOA),
        minutosSemana: minutos,
        jornadaSemana: jornadaDia * 5,
        esperadoAteHoje: esperado,
        percentual: esperado ? Math.round((minutos / esperado) * 100) : null,
      };
    });

    const mesas = new Map<
      string,
      {
        mesa: string;
        pessoas: number;
        abertos: number;
        parados: number;
        semResponsavel: number;
        minutosSemana: number;
        esperadoAteHoje: number;
      }
    >();
    const mesa = (nome: string) => {
      const m = mesas.get(nome) ?? {
        mesa: nome,
        pessoas: 0,
        abertos: 0,
        parados: 0,
        semResponsavel: 0,
        minutosSemana: 0,
        esperadoAteHoje: 0,
      };
      mesas.set(nome, m);
      return m;
    };
    for (const l of linhas) {
      const m = mesa(l.mesa);
      m.pessoas += 1;
      m.minutosSemana += l.minutosSemana;
      m.esperadoAteHoje += l.esperadoAteHoje;
    }
    for (const [nome, n] of semResponsavelPorMesa)
      mesa(nome).semResponsavel += n;
    // Abertos e parados por mesa contam o chamado da mesa, com ou sem
    // responsável (a mesa do chamado, não a do técnico).
    for (const [nome, n] of abertosPorMesa) mesa(nome).abertos = n;
    for (const [nome, n] of paradosPorMesa) mesa(nome).parados = n;

    return {
      semana,
      geradoEm: agora.toISOString(),
      totais: {
        abertos: abertos.length,
        parados: [...paradosPorMesa.values()].reduce((a, b) => a + b, 0),
        semResponsavel,
      },
      pessoas: linhas.sort(
        (a, b) =>
          b.parados - a.parados ||
          b.abertos - a.abertos ||
          a.nome.localeCompare(b.nome),
      ),
      mesas: [...mesas.values()].sort(
        (a, b) => b.abertos - a.abertos || a.mesa.localeCompare(b.mesa),
      ),
    };
  }
}
