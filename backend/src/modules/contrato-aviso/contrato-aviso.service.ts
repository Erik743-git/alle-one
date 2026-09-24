import { Injectable, Logger } from '@nestjs/common';
import { ContractStatus } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { getFrontendBaseUrl } from '../auth/password-reset.helper';
import type { AuthenticatedRequestUser } from '../auth/auth-request-user';
import { DashboardService } from '../dashboard/dashboard.service';
import { contractedHoursFromContract } from '../financial/financial-overview.util';
import { MailService } from '../mail/mail.service';
import { OportunidadesService } from '../oportunidades/oportunidades.service';
import {
  faixasParaAvisar,
  mesBrasilia,
  percentual,
  type Faixa,
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

/**
 * Aviso de consumo do contrato: ao passar de 80% e de 100% das horas
 * contratadas no mês, e-mail e Correio para os admins e para a mesa
 * Comercial. O gestor do cliente não recebe. Em 100%, abre sozinho uma
 * oportunidade "Renovação/ampliação de contrato" em Pendente.
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

  /** Horas contratadas no mês, igual ao Financeiro (linha ilimitada fica fora). */
  async horasContratadas(companyId: string, agora: Date): Promise<number> {
    const contratos = await this.prisma.contract.findMany({
      where: {
        companyId,
        deletedAt: null,
        status: ContractStatus.ACTIVE,
        OR: [{ endDate: null }, { endDate: { gte: agora } }],
      },
      select: {
        status: true,
        monthlyHours: true,
        specialties: { select: { monthlyHours: true, unlimited: true } },
      },
    });
    return contratos.reduce(
      (soma, c) =>
        soma +
        contractedHoursFromContract({
          status: c.status,
          monthlyHours: c.monthlyHours,
          specialties: c.specialties,
        }),
      0,
    );
  }

  async verificar(
    agora = new Date(),
  ): Promise<{ avisos: number; oportunidades: number }> {
    const { mes, inicio, fim } = mesBrasilia(agora);
    const empresas = await this.prisma.company.findMany({
      where: {
        deletedAt: null,
        status: true,
        tifluxClientId: { not: null },
        contracts: { some: { deletedAt: null, status: ContractStatus.ACTIVE } },
      },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    let avisos = 0;
    let oportunidades = 0;
    for (const emp of empresas) {
      try {
        const contratadas = await this.horasContratadas(emp.id, agora);
        if (!(contratadas > 0)) continue;
        const ja = await this.prisma.contratoAviso.findMany({
          where: { companyId: emp.id, mes },
          select: { faixa: true },
        });
        // Nada a avisar neste mês: não calcula as horas (poupa o painel).
        if (ja.length >= 2) continue;
        const r = await this.dashboard.getDashboardHours(SISTEMA, {
          group: 'financeiro',
          companyId: emp.id,
          start: inicio.toISOString(),
          end: fim.toISOString(),
        } as never);
        const usadas = Number(r?.summary?.totalHoras ?? 0);
        const pct = percentual(usadas, contratadas);
        const { registrar, avisar } = faixasParaAvisar(
          pct,
          ja.map((j) => j.faixa),
        );
        if (!avisar || pct == null) continue;

        // Registra antes de avisar: duas instâncias ao mesmo tempo não
        // mandam duas vezes (a chave primária barra a segunda).
        const gravou = await this.prisma.contratoAviso
          .createMany({
            data: registrar.map((faixa) => ({
              companyId: emp.id,
              mes,
              faixa,
              percentual: pct,
              horasUsadas: usadas,
              horasContratadas: contratadas,
            })),
            skipDuplicates: true,
          })
          .then((x) => x.count);
        if (!gravou) continue;

        let oportunidadeId: string | null = null;
        if (avisar === 100) {
          oportunidadeId = await this.abrirOportunidade(
            emp,
            mes,
            pct,
            usadas,
            contratadas,
          );
          if (oportunidadeId) {
            oportunidades += 1;
            await this.prisma.contratoAviso.update({
              where: {
                companyId_mes_faixa: { companyId: emp.id, mes, faixa: 100 },
              },
              data: { oportunidadeId },
            });
          }
        }
        await this.avisar(
          emp,
          mes,
          avisar,
          pct,
          usadas,
          contratadas,
          oportunidadeId,
        );
        avisos += 1;
      } catch (err) {
        this.logger.warn(
          `Aviso de contrato de ${emp.name} falhou: ${err instanceof Error ? err.message : String(err)}`,
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
   * Oportunidade de renovação. Se já existe uma aberta para a empresa (de
   * um mês anterior, ainda em andamento), não abre outra: o comercial já
   * está tratando.
   */
  private async abrirOportunidade(
    emp: { id: string; name: string },
    mes: string,
    pct: number,
    usadas: number,
    contratadas: number,
  ): Promise<string | null> {
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
        `O contrato da ${emp.name} chegou a ${pct}% das horas de ${m}/${ano}: ${horas(usadas)} usadas de ${horas(contratadas)} contratadas.`,
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

  private async avisar(
    emp: { id: string; name: string },
    mes: string,
    faixa: Faixa,
    pct: number,
    usadas: number,
    contratadas: number,
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
    for (const c of comercial) {
      if (!pessoas.has(c.id))
        pessoas.set(c.id, { id: c.id, email: c.email, admin: false });
    }
    if (!pessoas.size) return;
    const [ano, m] = mes.split('-');
    const titulo =
      faixa === 100
        ? `Contrato estourado: ${emp.name} passou de 100% das horas`
        : `Contrato em 80%: ${emp.name}`;
    const linhas = [
      `A ${emp.name} já usou ${pct}% das horas contratadas em ${m}/${ano}: ${horas(usadas)} de ${horas(contratadas)}.`,
      faixa === 100
        ? oportunidadeId
          ? 'Foi aberta uma oportunidade "Renovação/ampliação de contrato" em Pendente para o comercial.'
          : 'Já existe uma oportunidade de renovação aberta para esta empresa.'
        : 'Vale falar com o cliente antes de estourar.',
    ];
    const base = getFrontendBaseUrl();
    const linkFin = `${base}/financeiro?companyId=${emp.id}`;
    const linkOp = `${base}/oportunidades${oportunidadeId ? `?card=${oportunidadeId}` : ''}`;
    await this.mail
      .sendMail({
        to: [...pessoas.values()].map((p) => p.email),
        subject: `[Contrato ${faixa}%] ${emp.name} — ${pct}% das horas de ${m}/${ano}`,
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
        dedupeKey: `contrato-consumo:${emp.id}:${mes}:${faixa}`,
      })),
      skipDuplicates: true,
    });
  }
}
