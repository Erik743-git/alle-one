import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { MuralService } from './mural.service';

const AUTOR = { userId: 'u-autor', role: UserRole.COLLABORATOR };
const OUTRO = { userId: 'u-outro', role: UserRole.COLLABORATOR };
const ADMIN = { userId: 'u-admin', role: UserRole.ADMIN };

function bilhete(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'n1',
    message: 'Obrigado pela ajuda!',
    color: 'rosa',
    x: 0.2,
    y: 0.3,
    rotation: 3,
    anonymous: false,
    authorUserId: AUTOR.userId,
    createdAt: new Date('2026-09-23T12:00:00.000Z'),
    author: { name: 'Erik' },
    recipient: { name: 'Alisson' },
    ...over,
  };
}

/** Prisma de mentira com o mínimo que listar() usa. */
function prismaComNotas(
  notas: Array<Record<string, unknown>>,
  visita: Date | null = null,
) {
  return {
    muralNote: { findMany: jest.fn().mockResolvedValue(notas) },
    muralVisit: {
      findUnique: jest
        .fn()
        .mockResolvedValue(visita ? { seenAt: visita } : null),
      upsert: jest.fn().mockResolvedValue({}),
    },
  };
}

function servico(prisma: unknown) {
  return new MuralService(prisma as never);
}

describe('MuralService', () => {
  it('bilhete assinado mostra o nome de quem escreveu', async () => {
    const prisma = prismaComNotas([bilhete()]);
    const [dto] = await servico(prisma).listar(OUTRO);
    expect(dto.authorName).toBe('Erik');
    expect(dto.toName).toBe('Alisson');
    expect(dto.mine).toBe(false);
  });

  it('bilhete anônimo não sai com o autor nem para admin', async () => {
    const prisma = prismaComNotas([bilhete({ anonymous: true })]);
    const [paraAdmin] = await servico(prisma).listar(ADMIN);
    expect(paraAdmin.authorName).toBeNull();
    expect(paraAdmin.anonymous).toBe(true);

    const [paraOutro] = await servico(prisma).listar(OUTRO);
    expect(paraOutro.authorName).toBeNull();
  });

  it('o autor reconhece o próprio bilhete mesmo anônimo', async () => {
    const prisma = prismaComNotas([bilhete({ anonymous: true })]);
    const [dto] = await servico(prisma).listar(AUTOR);
    expect(dto.mine).toBe(true);
    expect(dto.canDelete).toBe(true);
    // Nem para o próprio autor o nome viaja: a tela já sabe que é dele.
    expect(dto.authorName).toBeNull();
  });

  it('admin pode tirar bilhete dos outros; colega não', async () => {
    const prisma = prismaComNotas([bilhete()]);
    const [paraAdmin] = await servico(prisma).listar(ADMIN);
    expect(paraAdmin.canDelete).toBe(true);
    const [paraColega] = await servico(prisma).listar(OUTRO);
    expect(paraColega.canDelete).toBe(false);
  });

  it('cor desconhecida vira a padrão', async () => {
    const create = jest.fn().mockResolvedValue(bilhete({ color: 'amarelo' }));
    const prisma = {
      muralNote: { create },
      mailboxNotification: { create: jest.fn() },
    };
    await servico(prisma).criar(AUTOR, { message: 'oi', color: 'roxo-neon' });
    expect(create.mock.calls[0][0].data.color).toBe('amarelo');
  });

  it('posição fora da parede é presa na borda', async () => {
    const create = jest.fn().mockResolvedValue(bilhete());
    const prisma = {
      muralNote: { create },
      mailboxNotification: { create: jest.fn() },
    };
    await servico(prisma).criar(AUTOR, { message: 'oi', x: 5, y: -2 });
    expect(create.mock.calls[0][0].data.x).toBe(1);
    expect(create.mock.calls[0][0].data.y).toBe(0);
  });

  it('só o autor edita o próprio bilhete', async () => {
    const prisma = {
      muralNote: {
        findFirst: jest.fn().mockResolvedValue(bilhete()),
        update: jest.fn(),
      },
    };
    await expect(
      servico(prisma).atualizar(ADMIN, 'n1', { message: 'mudei' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.muralNote.update).not.toHaveBeenCalled();
  });

  it('colega não tira bilhete que não é dele', async () => {
    const prisma = {
      muralNote: {
        findFirst: jest.fn().mockResolvedValue(bilhete()),
        update: jest.fn(),
      },
    };
    await expect(
      servico(prisma).remover(OUTRO, 'n1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('remover marca a data em vez de apagar a linha', async () => {
    const update = jest.fn().mockResolvedValue({});
    const prisma = {
      muralNote: { findFirst: jest.fn().mockResolvedValue(bilhete()), update },
    };
    await servico(prisma).remover(ADMIN, 'n1');
    expect(update.mock.calls[0][0].data.deletedAt).toBeInstanceOf(Date);
  });

  it('bilhete inexistente dá 404, não 403', async () => {
    const prisma = {
      muralNote: { findFirst: jest.fn().mockResolvedValue(null), update: jest.fn() },
    };
    await expect(
      servico(prisma).remover(ADMIN, 'n1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('MuralService — novidades, reações e mural do mês', () => {
  it('bilhete anterior à última visita não é novidade', async () => {
    const visita = new Date('2026-09-23T13:00:00.000Z');
    const prisma = prismaComNotas([bilhete()], visita);
    const [dto] = await servico(prisma).listar(OUTRO);
    expect(dto.isNew).toBe(false);
  });

  it('bilhete posterior à última visita acende como novidade', async () => {
    const visita = new Date('2026-09-23T11:00:00.000Z');
    const prisma = prismaComNotas([bilhete()], visita);
    const [dto] = await servico(prisma).listar(OUTRO);
    expect(dto.isNew).toBe(true);
  });

  it('primeira visita não acende o mural inteiro', async () => {
    const prisma = prismaComNotas([bilhete()], null);
    const [dto] = await servico(prisma).listar(OUTRO);
    expect(dto.isNew).toBe(false);
  });

  it('o próprio bilhete nunca aparece como novidade', async () => {
    const visita = new Date('2026-09-23T11:00:00.000Z');
    const prisma = prismaComNotas([bilhete()], visita);
    const [dto] = await servico(prisma).listar(AUTOR);
    expect(dto.isNew).toBe(false);
  });

  it('a visita é atualizada depois de ler a anterior', async () => {
    const visita = new Date('2026-09-23T11:00:00.000Z');
    const prisma = prismaComNotas([bilhete()], visita);
    await servico(prisma).listar(OUTRO);
    expect(prisma.muralVisit.upsert).toHaveBeenCalled();
  });

  it('conta as reações e marca a minha; emoji sem ninguém não aparece', async () => {
    const prisma = prismaComNotas([
      bilhete({
        reactions: [
          { emoji: '👏', userId: OUTRO.userId },
          { emoji: '👏', userId: AUTOR.userId },
          { emoji: '❤️', userId: AUTOR.userId },
        ],
      }),
    ]);
    const [dto] = await servico(prisma).listar(OUTRO);
    expect(dto.reactions).toEqual([
      { emoji: '👏', count: 2, mine: true },
      { emoji: '❤️', count: 1, mine: false },
    ]);
  });

  it('avisa no correio quem recebeu o bilhete', async () => {
    const criarAviso = jest.fn();
    const prisma = {
      muralNote: {
        create: jest.fn().mockResolvedValue(bilhete({ toUserId: 'u-outro' })),
      },
      mailboxNotification: { create: criarAviso },
    };
    await servico(prisma).criar(AUTOR, { message: 'valeu!', toUserId: 'u-outro' });
    expect(criarAviso).toHaveBeenCalled();
    expect(criarAviso.mock.calls[0][0].data.userId).toBe('u-outro');
  });

  it('não avisa quem escreveu o bilhete para si mesmo', async () => {
    const criarAviso = jest.fn();
    const prisma = {
      muralNote: {
        create: jest.fn().mockResolvedValue(bilhete({ toUserId: AUTOR.userId })),
      },
      mailboxNotification: { create: criarAviso },
    };
    await servico(prisma).criar(AUTOR, {
      message: 'nota para mim',
      toUserId: AUTOR.userId,
    });
    expect(criarAviso).not.toHaveBeenCalled();
  });

  it('aviso que falha não derruba a criação do bilhete', async () => {
    const prisma = {
      muralNote: {
        create: jest.fn().mockResolvedValue(bilhete({ toUserId: 'u-outro' })),
      },
      mailboxNotification: {
        create: jest.fn().mockRejectedValue(new Error('correio fora do ar')),
      },
    };
    await expect(
      servico(prisma).criar(AUTOR, { message: 'valeu!', toUserId: 'u-outro' }),
    ).resolves.toBeDefined();
  });

  it('mural do mês conta bilhetes recebidos, do maior para o menor', async () => {
    const prisma = {
      muralNote: {
        findMany: jest.fn().mockResolvedValue([
          { recipient: { name: 'Alisson' } },
          { recipient: { name: 'Mirella' } },
          { recipient: { name: 'Alisson' } },
          { recipient: null },
        ]),
      },
    };
    const resultado = await servico(prisma).doMes('2026-09');
    expect(resultado.mes).toBe('2026-09');
    expect(resultado.ranking).toEqual([
      { name: 'Alisson', total: 2 },
      { name: 'Mirella', total: 1 },
    ]);
  });
});
