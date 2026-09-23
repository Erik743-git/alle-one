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

function servico(prisma: unknown) {
  return new MuralService(prisma as never);
}

describe('MuralService', () => {
  it('bilhete assinado mostra o nome de quem escreveu', async () => {
    const prisma = {
      muralNote: { findMany: jest.fn().mockResolvedValue([bilhete()]) },
    };
    const [dto] = await servico(prisma).listar(OUTRO);
    expect(dto.authorName).toBe('Erik');
    expect(dto.toName).toBe('Alisson');
    expect(dto.mine).toBe(false);
  });

  it('bilhete anônimo não sai com o autor nem para admin', async () => {
    const prisma = {
      muralNote: {
        findMany: jest.fn().mockResolvedValue([bilhete({ anonymous: true })]),
      },
    };
    const [paraAdmin] = await servico(prisma).listar(ADMIN);
    expect(paraAdmin.authorName).toBeNull();
    expect(paraAdmin.anonymous).toBe(true);

    const [paraOutro] = await servico(prisma).listar(OUTRO);
    expect(paraOutro.authorName).toBeNull();
  });

  it('o autor reconhece o próprio bilhete mesmo anônimo', async () => {
    const prisma = {
      muralNote: {
        findMany: jest.fn().mockResolvedValue([bilhete({ anonymous: true })]),
      },
    };
    const [dto] = await servico(prisma).listar(AUTOR);
    expect(dto.mine).toBe(true);
    expect(dto.canDelete).toBe(true);
    // Nem para o próprio autor o nome viaja: a tela já sabe que é dele.
    expect(dto.authorName).toBeNull();
  });

  it('admin pode tirar bilhete dos outros; colega não', async () => {
    const prisma = {
      muralNote: { findMany: jest.fn().mockResolvedValue([bilhete()]) },
    };
    const [paraAdmin] = await servico(prisma).listar(ADMIN);
    expect(paraAdmin.canDelete).toBe(true);
    const [paraColega] = await servico(prisma).listar(OUTRO);
    expect(paraColega.canDelete).toBe(false);
  });

  it('cor desconhecida vira a padrão', async () => {
    const create = jest.fn().mockResolvedValue(bilhete({ color: 'amarelo' }));
    const prisma = { muralNote: { create } };
    await servico(prisma).criar(AUTOR, { message: 'oi', color: 'roxo-neon' });
    expect(create.mock.calls[0][0].data.color).toBe('amarelo');
  });

  it('posição fora da parede é presa na borda', async () => {
    const create = jest.fn().mockResolvedValue(bilhete());
    const prisma = { muralNote: { create } };
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
