import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedRequestUser } from '../auth/auth-request-user';
import { inicioJanelaPopup, jaMostrouHoje } from './nps-regras';

const PAPEIS_CLIENTE = new Set(['CLIENT', 'CLIENT_GESTOR', 'CLIENT_MEMBER']);
const CANCELADO = 'Cancelado';

export type Popup =
  | { tipo: 'NPS'; token: string; empresa: string }
  | {
      tipo: 'AVALIACAO';
      token: string;
      ticketNumber: number;
      titulo: string | null;
      responsavel: string | null;
    };

/**
 * Pop-up de satisfação no portal do cliente.
 *
 * - No máximo um por dia (NPS ou avaliação), virando à meia-noite de Brasília.
 * - NPS pendente tem prioridade; os dois nunca aparecem no mesmo dia.
 * - Avaliação: só chamados em que a pessoa é a solicitante, fechados nos
 *   últimos 30 dias, sem nota, não dispensados e não cancelados; o mais
 *   recente primeiro.
 * - "Agora não" dispensa aquela pesquisa: ela não volta no pop-up.
 */
@Injectable()
export class PopupSatisfacaoService {
  constructor(private readonly prisma: PrismaService) {}

  async proximo(
    user: AuthenticatedRequestUser,
    agora = new Date(),
  ): Promise<Popup | null> {
    if (!PAPEIS_CLIENTE.has(user.role)) return null;
    const ultimo = await this.prisma.popupSatisfacao.findUnique({
      where: { userId: user.userId },
      select: { ultimoEm: true },
    });
    if (jaMostrouHoje(ultimo?.ultimoEm ?? null, agora)) return null;

    const desde = inicioJanelaPopup(agora);
    const nps = await this.prisma.npsPesquisa.findFirst({
      where: {
        userId: user.userId,
        respondidaEm: null,
        dispensadaEm: null,
        enviadaEm: { gte: desde },
      },
      orderBy: { enviadaEm: 'desc' },
      select: { token: true, company: { select: { name: true } } },
    });
    if (nps) {
      await this.marcar(user.userId, 'NPS', agora);
      return { tipo: 'NPS', token: nps.token, empresa: nps.company.name };
    }

    const avaliacao = await this.proximaAvaliacao(user, desde);
    if (!avaliacao) return null;
    await this.marcar(user.userId, 'AVALIACAO', agora);
    return avaliacao;
  }

  private async proximaAvaliacao(
    user: AuthenticatedRequestUser,
    desde: Date,
  ): Promise<Popup | null> {
    const email = user.email?.trim();
    if (!email) return null;
    const candidatas = await this.prisma.ticketSatisfactionSurvey.findMany({
      where: {
        requestorEmail: { equals: email, mode: 'insensitive' },
        answeredAt: null,
        dismissedAt: null,
        sentAt: { gte: desde },
        NOT: { stageName: CANCELADO },
      },
      orderBy: { sentAt: 'desc' },
      take: 10,
      select: { token: true, ticketNumber: true, responsibleName: true },
    });
    if (!candidatas.length) return null;
    // Chamado reaberto e cancelado depois da pesquisa também fica de fora.
    const tickets = await this.prisma.portalTicket.findMany({
      where: { ticketNumber: { in: candidatas.map((c) => c.ticketNumber) } },
      select: { ticketNumber: true, title: true, stageName: true },
    });
    const porNumero = new Map(tickets.map((t) => [t.ticketNumber, t]));
    const escolhida = candidatas.find(
      (c) => porNumero.get(c.ticketNumber)?.stageName !== CANCELADO,
    );
    if (!escolhida) return null;
    return {
      tipo: 'AVALIACAO',
      token: escolhida.token,
      ticketNumber: escolhida.ticketNumber,
      titulo: porNumero.get(escolhida.ticketNumber)?.title ?? null,
      responsavel: escolhida.responsibleName,
    };
  }

  private async marcar(userId: string, tipo: 'NPS' | 'AVALIACAO', agora: Date) {
    await this.prisma.popupSatisfacao.upsert({
      where: { userId },
      create: { userId, ultimoEm: agora, ultimoTipo: tipo },
      update: { ultimoEm: agora, ultimoTipo: tipo },
    });
  }

  /** "Agora não": só a própria pessoa dispensa a própria pesquisa. */
  async dispensar(
    user: AuthenticatedRequestUser,
    tipo: 'NPS' | 'AVALIACAO',
    token: string,
  ) {
    const agora = new Date();
    if (tipo === 'NPS') {
      const r = await this.prisma.npsPesquisa.updateMany({
        where: { token, userId: user.userId, respondidaEm: null },
        data: { dispensadaEm: agora },
      });
      return { ok: r.count > 0 };
    }
    if (tipo === 'AVALIACAO') {
      const r = await this.prisma.ticketSatisfactionSurvey.updateMany({
        where: {
          token,
          answeredAt: null,
          requestorEmail: { equals: user.email, mode: 'insensitive' },
        },
        data: { dismissedAt: agora, dismissedCount: { increment: 1 } },
      });
      return { ok: r.count > 0 };
    }
    throw new BadRequestException('Tipo inválido.');
  }
}
