import { Injectable, Logger } from '@nestjs/common';
import { ContractStatus } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { getFrontendBaseUrl } from '../auth/password-reset.helper';
import type { AuthenticatedRequestUser } from '../auth/auth-request-user';
import { DashboardService } from '../dashboard/dashboard.service';
import { MailService } from '../mail/mail.service';
import { OportunidadesService } from '../oportunidades/oportunidades.service';
import {
  FAIXAS,
  FAIXA_DIA15,
  deveAvisarDia15,
  ehJanelaDia15,
  faixasParaAvisar,
  horasDaEspecialidade,
  mesBrasilia,
  percentual,
} from './contrato-aviso-regras';

function escapeHtml(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function horas(n: number): string {
  const min = Math.round(n * 60);
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`;
}

/** A rotina lê as horas como o painel do admin (todas as empresas). */
const SISTEMA: AuthenticatedRequestUser = {
  userId: 'system',
  email: 'system@local',
  role: 'ADMIN',
  companyId: null,
  permissions: [],
};

export const TITULO_RENOVACAO = 'Renovação/ampliação de contrato';

type Linha = {
  id: string;
  monthlyHours: number;
  especialidade: string;
  contratoTitulo: string;
  empresa: { id: string; name: string };
};

type Consumo = { usadas: number; contratadas: number; pct: number };

/**
 * Aviso de consumo de contrato, por LINHA (contrato + especialidade).
 *
 * - Qualquer dia: ao passar de 50%, 80% e 100% das horas da linha no mês,
 *   uma vez por mês cada.
 * - Dia 15, a partir das 8h de Brasília: linha em 50% ou menos.
 * - Horas da linha: as apontadas no mês em chamados da empresa na mesa com o
 *   nome da especialidade, na mesma soma por mesa do Financeiro. Linha
 *   ilimitada fica fora.
 * - E-mail e Correio para os admins e a mesa Comercial; o cliente não recebe.
 * - Em 100%, abre a oportunidade "Renovação/ampliação de contrato" (uma por
 *   empresa: se já houver uma aberta, não abre outra).
 *
 * Combinado em docs/desenho/APONTAMENTOS-TELAS-ADMIN.md (parte 5). Substitui
 * a conta por empresa (80% e 100%) de 24/09.
 */
@Injectable()
export class ContratoAvisoService {
  private readonly logger = new Logger(ContratoAvisoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dashboard: DashboardService,
    private readonly mail: MailService,
    private readonly oportunidades: OportunidadesService,
  ) {}

  /** Linhas com horas, de contratos ativos e não vencidos, de empresas ativas. */
  private async linhasAtivas(agora: Date): Promise<Linha[]> {
    const rows = await this.prisma.contractSpecialty.findMany({
      where: {
        unlimited: false,
        monthlyHours: { gt: 0 },
        contract: {
          deletedAt: null,
          status: ContractStatus.ACTIVE,
          OR: [{ endDate: null }, { endDate: { gte: agora } }],
          company: {
            deletedAt: null,
            status: true,
            tifluxClientId: { not: null },
          },
        },
      },
      select: {
        id: true,
        monthlyHours: true,
        specialty: { select: { name: true } },
        contract: {
          select: {
            title: true,
            company: { select: { id: true, name: true } },
          },
        },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      monthlyHours: r.monthlyHours,
      especialidade: r.specialty.name,
      contratoTitulo: r.contract.title,
      empresa: r.contract.company,
    }));
  }

  async verificar(
    agora = new Date(),
  ): Promise<{ avisos: number; oportunidades: number }> {
    const { mes, inicio, fim } = mesBrasilia(agora);
    const linhas = await this.linhasAtivas(agora);
    if (!linhas.length) return { avisos: 0, oportunidades: 0 };

    const ja = await this.prisma.contratoAvisoLinha.findMany({
      where: { mes, contractSpecialtyId: { in: linhas.map((l) => l.id) } },
      select: { contractSpecialtyId: true, faixa: true },
    });
    const avisadas = new Map<string, number[]>();
    for (const a of ja) {
      avisadas.set(a.contractSpecialtyId, [
        ...(avisadas.get(a.contractSpecialtyId) ?? []),
        a.faixa,
      ]);
    }

    const janelaDia15 = ehJanelaDia15(agora);

    // Uma conta do painel por empresa, e só se alguma linha dela ainda pode avisar.
    const porEmpresa = new Map<string, Linha[]>();
    for (const l of linhas) {
      porEmpresa.set(l.empresa.id, [
        ...(porEmpresa.get(l.empresa.id) ?? []),
        l,
      ]);
    }

    let avisos = 0;
    let oportunidades = 0;
    for (const [, dasEmpresa] of porEmpresa) {
      const empresa = dasEmpresa[0].empresa;
      const podeAvisar = dasEmpresa.some((l) => {
        const feitas = avisadas.get(l.id) ?? [];
        return (
          FAIXAS.some((f) => !feitas.includes(f)) ||
          (janelaDia15 && !feitas.includes(FAIXA_DIA15))
        );
      });
      if (!podeAvisar) continue;

      try {
        const r = await this.dashboard.getDashboardHours(SISTEMA, {
          group: 'financeiro',
          companyId: empresa.id,
          start: inicio.toISOString(),
          end: fim.toISOString(),
        } as never);
        const horasPorMesa = (r as { horasPorMesa?: unknown } | null)
          ?.horasPorMesa as
          | Array<{ deskName: string; totalMinutes: number }>
          | undefined;

        for (const linha of dasEmpresa) {
          const usadas = horasDaEspecialidade(
            horasPorMesa,
            linha.especialidade,
          );
          const contratadas = linha.monthlyHours;
          const pct = percentual(usadas, contratadas);
          if (pct == null) continue;
          const feitas = avisadas.get(linha.id) ?? [];
          const consumo = { usadas, contratadas, pct };

          const { registrar, avisar } = faixasParaAvisar(pct, feitas);
          if (avisar) {
            const r1 = await this.avisarFaixa(
              linha,
              mes,
              registrar,
              avisar,
              consumo,
            );
            avisos += r1.avisos;
            oportunidades += r1.oportunidades;
          }
          if (deveAvisarDia15({ agora, pct, jaAvisadas: feitas })) {
            if (await this.registrar(linha, mes, [FAIXA_DIA15], consumo)) {
              await this.avisar(linha, mes, FAIXA_DIA15, consumo, null);
              avisos += 1;
            }
          }
        }
      } catch (err) {
        this.logger.warn(
          `Aviso de contrato de ${empresa.name} falhou: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    if (avisos)
      this.logger.log(
        `Contratos: ${avisos} aviso(s), ${oportunidades} oportunidade(s).`,
      );
    return { avisos, oportunidades };
  }

  /**
   * Registra antes de avisar: duas instâncias ao mesmo tempo não mandam duas
   * vezes (a chave primária barra a segunda). Devolve se gravou.
   */
  private async registrar(
    linha: Linha,
    mes: string,
    faixas: number[],
    c: Consumo,
  ): Promise<boolean> {
    const gravou = await this.prisma.contratoAvisoLinha.createMany({
      data: faixas.map((faixa) => ({
        contractSpecialtyId: linha.id,
        mes,
        faixa,
        companyId: linha.empresa.id,
        percentual: c.pct,
        horasUsadas: c.usadas,
        horasContratadas: c.contratadas,
      })),
      skipDuplicates: true,
    });
    return gravou.count > 0;
  }

  private async avisarFaixa(
    linha: Linha,
    mes: string,
    registrar: number[],
    faixa: number,
    c: Consumo,
  ): Promise<{ avisos: number; oportunidades: number }> {
    if (!(await this.registrar(linha, mes, registrar, c))) {
      return { avisos: 0, oportunidades: 0 };
    }
    let oportunidadeId: string | null = null;
    if (faixa === 100) {
      oportunidadeId = await this.abrirOportunidade(linha, mes, c);
      if (oportunidadeId) {
        await this.prisma.contratoAvisoLinha.update({
          where: {
            contractSpecialtyId_mes_faixa: {
              contractSpecialtyId: linha.id,
              mes,
              faixa: 100,
            },
          },
          data: { oportunidadeId },
        });
      }
    }
    await this.avisar(linha, mes, faixa, c, oportunidadeId);
    return { avisos: 1, oportunidades: oportunidadeId ? 1 : 0 };
  }

  /**
   * Oportunidade de renovação. Se já existe uma aberta para a empresa (de
   * outra linha ou de um mês anterior, ainda em andamento), não abre outra: o
   * comercial já está tratando.
   */
  private async abrirOportunidade(
    linha: Linha,
    mes: string,
    c: Consumo,
  ): Promise<string | null> {
    const emp = linha.empresa;
    const aberta = await this.prisma.oportunidade.findFirst({
      where: {
        companyId: emp.id,
        deletedAt: null,
        titulo: { startsWith: TITULO_RENOVACAO },
        estagio: { notIn: ['FECHADO', 'REPROVADO'] },
      },
      select: { id: true },
    });
    if (aberta) return null;
    const [ano, m] = mes.split('-');
    const card = await this.oportunidades.criarAutomatica({
      titulo: `${TITULO_RENOVACAO} — ${emp.name}`,
      descricao: [
        `A linha ${linha.especialidade} do contrato "${linha.contratoTitulo}" da ${emp.name} chegou a ${c.pct}% das horas de ${m}/${ano}: ${horas(c.usadas)} usadas de ${horas(c.contratadas)} contratadas.`,
        '',
        'Card aberto automaticamente pelo aviso de consumo de contrato.',
      ].join('\n'),
      tipo: 'CONTRATO',
      companyId: emp.id,
      clienteNome: emp.name,
      origemDescricao: 'Alle One (aviso de contrato)',
    });
    return card.id;
  }

  private textos(
    linha: Linha,
    mes: string,
    faixa: number,
    c: Consumo,
    oportunidadeId: string | null,
  ): { assunto: string; titulo: string; linhas: string[] } {
    const [ano, m] = mes.split('-');
    const quem = `${linha.empresa.name} — ${linha.especialidade}`;
    const detalhe = [
      `Cliente: ${linha.empresa.name}`,
      `Contrato: ${linha.contratoTitulo}`,
      `Especialidade: ${linha.especialidade}`,
      `Horas em ${m}/${ano}: ${horas(c.usadas)} usadas de ${horas(c.contratadas)} contratadas (${c.pct}%).`,
    ];
    if (faixa === FAIXA_DIA15) {
      return {
        assunto: `[Contrato no dia 15: ${c.pct}%] ${quem}`,
        titulo: `Contrato em ${c.pct}% no dia 15: ${quem}`,
        linhas: [
          ...detalhe,
          'Chegou o dia 15 e a linha está em 50% ou menos das horas do mês.',
        ],
      };
    }
    const fecho =
      faixa === 100
        ? oportunidadeId
          ? 'Foi aberta uma oportunidade "Renovação/ampliação de contrato" em Pendente para o comercial.'
          : 'Já existe uma oportunidade de renovação aberta para esta empresa.'
        : faixa === 80
          ? 'Vale falar com o cliente antes de estourar.'
          : 'Metade das horas do mês desta linha já foi usada.';
    return {
      assunto: `[Contrato ${faixa}%] ${quem}`,
      titulo:
        faixa === 100
          ? `Contrato estourado: ${quem} passou de 100% das horas`
          : `Contrato em ${faixa}%: ${quem}`,
      linhas: [...detalhe, fecho],
    };
  }

  private async avisar(
    linha: Linha,
    mes: string,
    faixa: number,
    c: Consumo,
    oportunidadeId: string | null,
  ) {
    const [admins, comercial] = await Promise.all([
      this.prisma.user.findMany({
        where: { role: 'ADMIN', deletedAt: null, status: 'ACTIVE' },
        select: { id: true, email: true },
      }),
      this.oportunidades.pessoasDoComercial(),
    ]);
    const pessoas = new Map<
      string,
      { id: string; email: string; admin: boolean }
    >();
    for (const a of admins) pessoas.set(a.id, { ...a, admin: true });
    for (const p of comercial) {
      if (!pessoas.has(p.id))
        pessoas.set(p.id, { id: p.id, email: p.email, admin: false });
    }
    if (!pessoas.size) return;

    const emp = linha.empresa;
    const { assunto, titulo, linhas } = this.textos(
      linha,
      mes,
      faixa,
      c,
      oportunidadeId,
    );
    const base = getFrontendBaseUrl();
    const linkFin = `${base}/financeiro?companyId=${emp.id}`;
    const linkOp = `${base}/oportunidades${oportunidadeId ? `?card=${oportunidadeId}` : ''}`;
    await this.mail
      .sendMail({
        to: [...pessoas.values()].map((p) => p.email),
        subject: assunto,
        text: `${linhas.join('\n')}\n\nFinanceiro: ${linkFin}\nOportunidades: ${linkOp}\n\nAlle One`,
        html: `${linhas.map((l) => `<p>${escapeHtml(l)}</p>`).join('')}<p><a href="${escapeHtml(linkFin)}">Ver no Financeiro</a> · <a href="${escapeHtml(linkOp)}">Ver em Oportunidades</a></p>`,
      })
      .catch((err: unknown) =>
        this.logger.warn(
          `E-mail do aviso de contrato (${emp.name}) falhou: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    await this.prisma.mailboxNotification.createMany({
      data: [...pessoas.values()].map((p) => ({
        userId: p.id,
        kind: 'CONTRATO_CONSUMO' as const,
        title: titulo.slice(0, 200),
        body: linhas.join(' ').slice(0, 500),
        // Comercial sem Financeiro cai na oportunidade.
        href: p.admin ? `/financeiro?companyId=${emp.id}` : '/oportunidades',
        dedupeKey: `contrato-consumo:${linha.id}:${mes}:${faixa}`,
      })),
      skipDuplicates: true,
    });
  }
}
