import { ForbiddenException, Injectable } from '@nestjs/common';
import { ContractStatus } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedRequestUser } from '../auth/auth-request-user';
import {
  horasDaEspecialidade,
  mesBrasilia,
} from '../contrato-aviso/contrato-aviso-regras';
import { DashboardService } from '../dashboard/dashboard.service';
import {
  horasEsgotadas,
  instanteDoDia,
  mensagemTrava,
  passaPelaTrava,
} from './contrato-trava-regras';

const SISTEMA: AuthenticatedRequestUser = {
  userId: 'system',
  email: 'system@local',
  role: 'ADMIN',
  companyId: null,
  permissions: [],
};

/** Horas por mesa da empresa no mês: 60 s de cache para não pesar no apontar. */
const CACHE_MS = 60_000;

type HorasPorMesa = Array<{ deskName: string; totalMinutes: number }>;

/**
 * Trava de apontamento por contrato: com "Travar ao esgotar as horas" no
 * contrato, cada linha (especialidade) trava quando as horas do mês chegam ao
 * contratado. A conta é a mesma do aviso de contrato (painel Financeiro).
 */
@Injectable()
export class ContratoTravaService {
  private readonly cache = new Map<
    string,
    { em: number; horas: HorasPorMesa }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly dashboard: DashboardService,
  ) {}

  private async horasPorMesa(
    companyId: string,
    quando: Date,
  ): Promise<HorasPorMesa> {
    const { mes, inicio, fim } = mesBrasilia(quando);
    const chave = `${companyId}|${mes}`;
    const salvo = this.cache.get(chave);
    if (salvo && Date.now() - salvo.em < CACHE_MS) return salvo.horas;
    const r = await this.dashboard.getDashboardHours(SISTEMA, {
      group: 'financeiro',
      companyId,
      start: inicio.toISOString(),
      end: fim.toISOString(),
    } as never);
    const horas =
      ((r as { horasPorMesa?: unknown } | null)?.horasPorMesa as
        | HorasPorMesa
        | undefined) ?? [];
    this.cache.set(chave, { em: Date.now(), horas });
    return horas;
  }

  /** Esquece a conta da empresa (depois de gravar um apontamento). */
  esquecer(companyId: string): void {
    for (const k of this.cache.keys()) {
      if (k.startsWith(`${companyId}|`)) this.cache.delete(k);
    }
  }

  /**
   * Recusa o apontamento se a linha do contrato do chamado tem trava e as
   * horas do mês do apontamento já acabaram. Admin passa.
   * Devolve o id da empresa travável (para limpar o cache depois de gravar).
   */
  async assertPodeApontar(params: {
    actor: AuthenticatedRequestUser;
    ticketNumber: number;
    dataYmd: string;
  }): Promise<string | null> {
    const ticket = await this.prisma.portalTicket.findUnique({
      where: { ticketNumber: params.ticketNumber },
      select: { clientExternalId: true, specialtyId: true },
    });
    if (!ticket?.clientExternalId || !ticket.specialtyId) return null;

    const quando = instanteDoDia(params.dataYmd);
    const linha = await this.prisma.contractSpecialty.findFirst({
      where: {
        specialtyId: ticket.specialtyId,
        unlimited: false,
        monthlyHours: { gt: 0 },
        contract: {
          lockOnExhausted: true,
          deletedAt: null,
          status: ContractStatus.ACTIVE,
          startDate: { lte: quando },
          OR: [{ endDate: null }, { endDate: { gte: quando } }],
          company: {
            deletedAt: null,
            tifluxClientId: ticket.clientExternalId,
          },
        },
      },
      select: {
        monthlyHours: true,
        specialty: { select: { name: true } },
        contract: { select: { title: true, companyId: true } },
      },
    });
    if (!linha) return null;
    if (passaPelaTrava(params.actor.role)) return linha.contract.companyId;

    const usadas = horasDaEspecialidade(
      await this.horasPorMesa(linha.contract.companyId, quando),
      linha.specialty.name,
    );
    if (horasEsgotadas(usadas, linha.monthlyHours)) {
      throw new ForbiddenException({
        message: mensagemTrava({
          contrato: linha.contract.title,
          especialidade: linha.specialty.name,
          usadas,
          contratadas: linha.monthlyHours,
        }),
        code: 'CONTRATO_ESGOTADO',
      });
    }
    return linha.contract.companyId;
  }
}
