import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';

/** Nota que dispara o alerta para alguém ligar para o cliente. */
export const NOTA_ALERTA_MAXIMA = 2;
/** Comentário gravado quando a pessoa elogia sem escrever nada. */
export const COMENTARIO_PADRAO_ELOGIO = 'Bom atendimento!';

export type RespostaPesquisa = {
  rating: number;
  comment?: string | null;
  channel: 'EMAIL' | 'PORTAL';
};

@Injectable()
export class TicketSatisfactionService {
  private readonly logger = new Logger(TicketSatisfactionService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Abre a pesquisa de um chamado fechado e devolve o token do link.
   *
   * Uma por chamado: reabrir e fechar de novo não gera outra pesquisa nem
   * apaga a resposta que o cliente já deu.
   */
  async criarParaTicketFechado(params: {
    ticketNumber: number;
    stageName: string;
  }): Promise<{ token: string; jaExistia: boolean } | null> {
    const existente = await this.prisma.ticketSatisfactionSurvey.findUnique({
      where: { ticketNumber: params.ticketNumber },
      select: { token: true },
    });
    if (existente) return { token: existente.token, jaExistia: true };

    const ticket = await this.prisma.portalTicket.findUnique({
      where: { ticketNumber: params.ticketNumber },
      select: {
        requestorEmail: true,
        requestorName: true,
        clientExternalId: true,
        specialtyId: true,
        deskName: true,
        responsibleName: true,
        responsibleExternalId: true,
      },
    });
    const email = ticket?.requestorEmail?.trim();
    if (!email) return null;

    // Chamado antigo pode ter só o nome da mesa; sem isso a nota ficaria de
    // fora do "por mesa" no painel.
    const mesaId =
      ticket?.specialtyId ??
      (ticket?.deskName?.trim()
        ? (
            await this.prisma.specialty.findFirst({
              where: { name: ticket.deskName.trim(), deletedAt: null },
              select: { id: true },
            })
          )?.id ?? null
        : null);

    const empresa =
      ticket?.clientExternalId != null
        ? await this.prisma.company.findFirst({
            where: { tifluxClientId: ticket.clientExternalId, deletedAt: null },
            select: { id: true },
          })
        : null;

    const criada = await this.prisma.ticketSatisfactionSurvey.create({
      data: {
        ticketNumber: params.ticketNumber,
        token: randomBytes(24).toString('hex'),
        requestorEmail: email,
        requestorName: ticket?.requestorName ?? null,
        companyId: empresa?.id ?? null,
        specialtyId: mesaId,
        responsibleName: ticket?.responsibleName ?? null,
        responsibleExternalId: ticket?.responsibleExternalId ?? null,
        stageName: params.stageName,
      },
      select: { token: true },
    });
    return { token: criada.token, jaExistia: false };
  }

  /** Dados da tela pública, pelo token do e-mail. */
  async obterPorToken(token: string) {
    const pesquisa = await this.prisma.ticketSatisfactionSurvey.findUnique({
      where: { token },
      select: {
        ticketNumber: true,
        requestorName: true,
        responsibleName: true,
        rating: true,
        comment: true,
        answeredAt: true,
      },
    });
    if (!pesquisa) {
      throw new NotFoundException('Pesquisa não encontrada ou já expirada.');
    }

    const ticket = await this.prisma.portalTicket.findUnique({
      where: { ticketNumber: pesquisa.ticketNumber },
      select: { title: true, clientName: true },
    });

    return {
      ticketNumber: pesquisa.ticketNumber,
      title: ticket?.title ?? null,
      clientName: ticket?.clientName ?? null,
      requestorName: pesquisa.requestorName,
      responsibleName: pesquisa.responsibleName,
      // Já respondida: a tela mostra a nota em vez de pedir de novo.
      rating: pesquisa.rating,
      comment: pesquisa.comment,
      answeredAt: pesquisa.answeredAt?.toISOString() ?? null,
    };
  }

  /**
   * Grava a resposta. A nota pode ser trocada enquanto o cliente estiver na
   * tela (ele clica a estrela no e-mail e depois ajusta), mas o alerta de
   * nota baixa só sai uma vez.
   */
  async responder(token: string, resposta: RespostaPesquisa) {
    if (
      !Number.isInteger(resposta.rating) ||
      resposta.rating < 1 ||
      resposta.rating > 5
    ) {
      throw new BadRequestException('A nota vai de 1 a 5 estrelas.');
    }

    const pesquisa = await this.prisma.ticketSatisfactionSurvey.findUnique({
      where: { token },
      select: { id: true, ticketNumber: true, rating: true },
    });
    if (!pesquisa) {
      throw new NotFoundException('Pesquisa não encontrada ou já expirada.');
    }

    const comentario = resposta.comment?.trim() || '';
    // O texto padrão só vale para elogio: gravar "Bom atendimento!" numa nota
    // baixa mentiria no relatório e no alerta.
    const comentarioFinal =
      comentario || (resposta.rating >= 4 ? COMENTARIO_PADRAO_ELOGIO : '');

    await this.prisma.ticketSatisfactionSurvey.update({
      where: { id: pesquisa.id },
      data: {
        rating: resposta.rating,
        comment: comentarioFinal || null,
        channel: resposta.channel,
        answeredAt: new Date(),
      },
    });

    const eraAlerta =
      pesquisa.rating != null && pesquisa.rating <= NOTA_ALERTA_MAXIMA;
    if (resposta.rating <= NOTA_ALERTA_MAXIMA && !eraAlerta) {
      await this.abrirAvisoDeNotaBaixa({
        ticketNumber: pesquisa.ticketNumber,
        rating: resposta.rating,
        comment: comentarioFinal,
      });
    }

    return { ok: true, rating: resposta.rating };
  }

  /** O cliente clicou "Agora não" no portal. */
  async dispensar(ticketNumber: number) {
    await this.prisma.ticketSatisfactionSurvey.updateMany({
      where: { ticketNumber, answeredAt: null },
      data: { dismissedCount: { increment: 1 }, dismissedAt: new Date() },
    });
    return { ok: true };
  }

  /**
   * Nota baixa vira pré-ticket para alguém ligar para o cliente no mesmo dia.
   * Sem isso a pesquisa só geraria gráfico.
   */
  private async abrirAvisoDeNotaBaixa(params: {
    ticketNumber: number;
    rating: number;
    comment: string;
  }) {
    const messageId = `nps-nota-baixa-${params.ticketNumber}`;
    try {
      const existe = await this.prisma.preTicket.findUnique({
        where: { messageId },
        select: { id: true },
      });
      if (existe) return;

      const ticket = await this.prisma.portalTicket.findUnique({
        where: { ticketNumber: params.ticketNumber },
        select: {
          title: true,
          clientName: true,
          clientExternalId: true,
          specialtyId: true,
          requestorName: true,
          requestorEmail: true,
          responsibleName: true,
        },
      });

      const empresa =
        ticket?.clientExternalId != null
          ? await this.prisma.company.findFirst({
              where: {
                tifluxClientId: ticket.clientExternalId,
                deletedAt: null,
              },
              select: { id: true },
            })
          : null;

      const remetente =
        process.env.MAIL_FROM?.trim() || 'no-reply@alleone.local';
      const texto = [
        `O chamado #${params.ticketNumber} — ${ticket?.title ?? ''} recebeu ${params.rating} de 5 estrelas.`,
        '',
        `Cliente: ${ticket?.clientName ?? '—'}`,
        `Solicitante: ${ticket?.requestorName ?? '—'} (${ticket?.requestorEmail ?? '—'})`,
        `Atendimento: ${ticket?.responsibleName ?? '—'}`,
        '',
        params.comment
          ? `Comentário: ${params.comment}`
          : 'O cliente não deixou comentário.',
        '',
        'Entrar em contato com o cliente hoje.',
      ].join('\n');

      await this.prisma.preTicket.create({
        data: {
          status: 'PENDING',
          title: `[Satisfação] Nota ${params.rating} no chamado #${params.ticketNumber}`,
          descriptionText: texto,
          descriptionHtml: `<p>${texto.replace(/\n/g, '<br>')}</p>`,
          fromName: 'Pesquisa de satisfação',
          fromEmail: remetente,
          toEmails: [remetente],
          channel: 'Satisfação',
          mailboxAddress: remetente,
          messageId,
          companyId: empresa?.id ?? null,
          specialtyId: ticket?.specialtyId ?? null,
          receivedAt: new Date(),
        },
      });
      this.logger.log(
        `Nota ${params.rating} no #${params.ticketNumber} entrou na fila de pré-tickets.`,
      );
    } catch (err) {
      this.logger.warn(
        `Falha ao abrir aviso de nota baixa do #${params.ticketNumber}: ${
          err instanceof Error ? err.message : err
        }`,
      );
    }
  }
}
