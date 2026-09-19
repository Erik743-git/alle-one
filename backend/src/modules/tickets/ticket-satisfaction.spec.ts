import { BadRequestException } from '@nestjs/common';
import {
  COMENTARIO_PADRAO_ELOGIO,
  HORAS_PARA_TROCAR_NOTA,
  TicketSatisfactionService,
} from './ticket-satisfaction.service';

/**
 * A estrela clicada no e-mail grava na hora — é o que garante a resposta de
 * quem não quer escrever nada. A tela depois deixa trocar a nota e comentar,
 * por um tempo; passado o prazo, a avaliação é histórico.
 */
describe('TicketSatisfactionService — resposta', () => {
  function criar(pesquisa: Record<string, unknown> | null) {
    const update = jest.fn().mockResolvedValue({});
    const preTicketCreate = jest.fn().mockResolvedValue({});
    const prisma = {
      ticketSatisfactionSurvey: {
        findUnique: jest.fn().mockResolvedValue(pesquisa),
        update,
      },
      preTicket: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: preTicketCreate,
      },
      portalTicket: { findUnique: jest.fn().mockResolvedValue({}) },
      company: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    return {
      service: new TicketSatisfactionService(prisma as never),
      update,
      preTicketCreate,
    };
  }

  const base = { id: 's1', ticketNumber: 1, rating: null, answeredAt: null };

  it('nota alta sem comentário ganha o texto padrão', async () => {
    const { service, update } = criar(base);

    await service.responder('tok', { rating: 5, channel: 'EMAIL' });

    expect(update.mock.calls[0][0].data.comment).toBe(COMENTARIO_PADRAO_ELOGIO);
  });

  it('nota baixa sem comentário fica sem comentário', async () => {
    const { service, update, preTicketCreate } = criar(base);

    await service.responder('tok', { rating: 1, channel: 'PORTAL' });

    expect(update.mock.calls[0][0].data.comment).toBeNull();
    // E vira alerta na fila.
    expect(preTicketCreate).toHaveBeenCalledTimes(1);
  });

  it('deixa trocar a nota dentro do prazo', async () => {
    const umaHoraAtras = new Date(Date.now() - 60 * 60 * 1000);
    const { service, update } = criar({
      ...base,
      rating: 5,
      answeredAt: umaHoraAtras,
    });

    await service.responder('tok', {
      rating: 2,
      comment: 'demorou demais',
      channel: 'PORTAL',
    });

    expect(update.mock.calls[0][0].data.rating).toBe(2);
    expect(update.mock.calls[0][0].data.comment).toBe('demorou demais');
  });

  it('recusa trocar depois do prazo', async () => {
    const antigo = new Date(
      Date.now() - (HORAS_PARA_TROCAR_NOTA + 1) * 60 * 60 * 1000,
    );
    const { service, update } = criar({
      ...base,
      rating: 5,
      answeredAt: antigo,
    });

    await expect(
      service.responder('tok', { rating: 1, channel: 'PORTAL' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(update).not.toHaveBeenCalled();
  });

  it('não repete o alerta quando a nota baixa é só ajustada', async () => {
    const { service, preTicketCreate } = criar({
      ...base,
      rating: 2,
      answeredAt: new Date(),
    });

    await service.responder('tok', { rating: 1, channel: 'PORTAL' });

    expect(preTicketCreate).not.toHaveBeenCalled();
  });
});
