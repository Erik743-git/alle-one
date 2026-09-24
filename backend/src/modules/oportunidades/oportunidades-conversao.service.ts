import { BadRequestException, Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import type { AuthenticatedRequestUser } from '../auth/auth-request-user';
import { ProjetosService } from '../projetos/projetos.service';
import { TicketsService } from '../tickets/tickets.service';
import { OportunidadesService, type Card } from './oportunidades.service';

export type PedidoConversao =
  | { destino: 'CHAMADO'; deskId: number }
  | {
      destino: 'PROJETO';
      budgetUnit: 'HOURS' | 'DAYS';
      budgetAmount: number;
      /** Todo projeto nasce ligado a um chamado (regra dos Projetos). */
      ticketNumber?: number;
    };

function paraHtml(texto: string): string {
  const esc = texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return esc
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/**
 * Oportunidade aprovada vira chamado ou projeto, já com cliente, título e
 * descrição. Usa a mesma criação das telas de Chamado e Projeto, então vale
 * a permissão que a pessoa já tem nesses módulos.
 */
@Injectable()
export class OportunidadesConversaoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly oportunidades: OportunidadesService,
    private readonly tickets: TicketsService,
    private readonly projetos: ProjetosService,
  ) {}

  async converter(
    actor: AuthenticatedRequestUser,
    id: string,
    pedido: PedidoConversao,
  ): Promise<Card> {
    const perfil = await this.oportunidades.perfil(actor);
    if (!perfil.admin && !perfil.comercial) {
      throw new BadRequestException(
        'Só o comercial e os administradores convertem.',
      );
    }
    const card = await this.oportunidades.obter(actor, id);
    const aprovada =
      card.estagio === 'APROVADO' ||
      (card.estagio === 'FECHADO' && card.estagioAnterior === 'APROVADO');
    if (!aprovada) {
      throw new BadRequestException(
        'Só oportunidade aprovada vira chamado ou projeto.',
      );
    }
    if (!card.cliente?.companyId) {
      throw new BadRequestException(
        'Escolha um cliente cadastrado no card antes de converter.',
      );
    }
    const descricao =
      card.descricao.trim() || `Oportunidade #${card.numero} aprovada.`;

    if (pedido.destino === 'CHAMADO') {
      if (card.chamadoNumero) {
        throw new BadRequestException(
          `Já virou o chamado #${card.chamadoNumero}.`,
        );
      }
      const empresa = await this.prisma.company.findUniqueOrThrow({
        where: { id: card.cliente.companyId },
        select: { tifluxClientId: true },
      });
      if (!empresa.tifluxClientId) {
        throw new BadRequestException(
          'O cliente não tem cadastro de chamados.',
        );
      }
      const solicitanteEmail = card.solicitante.email;
      const eu = await this.prisma.user.findUniqueOrThrow({
        where: { id: actor.userId },
        select: { name: true, email: true },
      });
      const criado = await this.tickets.createTicket(actor, {
        title: card.titulo,
        description: paraHtml(
          `${descricao}\n\nOrigem: oportunidade #${card.numero}.`,
        ),
        clientId: empresa.tifluxClientId,
        deskId: pedido.deskId,
        requestorName: solicitanteEmail ? card.solicitante.nome : eu.name,
        requestorEmail: solicitanteEmail ?? eu.email,
      } as never);
      const numero = (criado as { ticketNumber?: number }).ticketNumber;
      if (!numero) throw new BadRequestException('O chamado não foi criado.');
      await this.gravar(
        id,
        actor.userId,
        { chamadoNumero: numero },
        `CHAMADO #${numero}`,
      );
    } else {
      if (card.projetoId) throw new BadRequestException('Já virou projeto.');
      // Todo projeto nasce ligado a um chamado (regra do módulo Projetos):
      // usa o chamado que a oportunidade já gerou, ou o número informado.
      const ticketNumber = pedido.ticketNumber ?? card.chamadoNumero;
      if (!ticketNumber) {
        throw new BadRequestException(
          'Projeto precisa de um chamado: converta em chamado primeiro ou informe o número.',
        );
      }
      const projeto = (await this.projetos.createProject(
        actor,
        card.cliente.companyId,
        {
          name: card.titulo,
          description: `${descricao}\n\nOrigem: oportunidade #${card.numero}.`,
          budgetUnit: pedido.budgetUnit,
          budgetAmount: pedido.budgetAmount,
          ticketNumber,
        } as never,
      )) as { id?: string };
      if (!projeto?.id)
        throw new BadRequestException('O projeto não foi criado.');
      await this.gravar(
        id,
        actor.userId,
        { projetoId: projeto.id },
        `PROJETO ${projeto.id}`,
      );
    }
    return this.oportunidades.obter(actor, id);
  }

  /** Mesas liberadas para o cliente do card (para virar chamado). */
  async mesas(actor: AuthenticatedRequestUser, id: string) {
    const card = await this.oportunidades.obter(actor, id);
    if (!card.cliente?.companyId) return [];
    const rows = await this.prisma.companyTicketSpecialty.findMany({
      where: {
        companyId: card.cliente.companyId,
        specialty: { deletedAt: null, active: true, externalId: { not: null } },
      },
      select: { specialty: { select: { externalId: true, name: true } } },
    });
    return rows
      .map((r) => ({
        id: r.specialty.externalId as number,
        nome: r.specialty.name,
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }

  private async gravar(
    id: string,
    userId: string,
    data: { chamadoNumero?: number; projetoId?: string },
    para: string,
  ) {
    await this.prisma.$transaction([
      this.prisma.oportunidade.update({
        where: { id },
        data: { ...data, ultimaMovimentacao: new Date() },
      }),
      this.prisma.oportunidadeEvento.create({
        data: { oportunidadeId: id, tipo: 'CONVERTIDA', para, userId },
      }),
    ]);
  }
}
