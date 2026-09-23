import { BadRequestException, NotFoundException } from '@nestjs/common';

import { EscalaService } from './escala.service';

const REGRA = {
  userId: 'a1b2c3d4-0000-4000-8000-000000000001',
  specialtyId: 'a1b2c3d4-0000-4000-8000-000000000002',
  startTime: '22:00',
  endTime: '06:00',
  daysOfWeek: [1, 3],
  validFrom: '2026-09-01',
  validTo: null,
};

function prismaFalso() {
  const prisma = {
    escalaRegra: {
      create: jest.fn().mockResolvedValue({ id: 'r1' }),
      findFirst: jest.fn().mockResolvedValue({ id: 'r1' }),
      update: jest.fn().mockResolvedValue({}),
    },
    escalaExcecao: {
      deleteMany: jest.fn().mockReturnValue('apagar'),
      create: jest.fn().mockReturnValue('criar'),
    },
    $transaction: jest.fn().mockResolvedValue([]),
  };
  return prisma;
}

const servico = (prisma: unknown) => new EscalaService(prisma as never);

describe('EscalaService — regras', () => {
  it('aceita turno que cruza a meia-noite', async () => {
    const prisma = prismaFalso();
    await servico(prisma).criarRegra('admin', REGRA);
    expect(prisma.escalaRegra.create).toHaveBeenCalled();
  });

  it('recusa início igual ao fim', async () => {
    await expect(
      servico(prismaFalso()).criarRegra('admin', { ...REGRA, endTime: '22:00' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('recusa regra sem dia da semana', async () => {
    await expect(
      servico(prismaFalso()).criarRegra('admin', { ...REGRA, daysOfWeek: [] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('recusa validade que termina antes de começar', async () => {
    await expect(
      servico(prismaFalso()).criarRegra('admin', {
        ...REGRA,
        validFrom: '2026-09-10',
        validTo: '2026-09-01',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('dias repetidos viram um só, em ordem', async () => {
    const prisma = prismaFalso();
    await servico(prisma).criarRegra('admin', { ...REGRA, daysOfWeek: [3, 1, 3] });
    expect(prisma.escalaRegra.create.mock.calls[0][0].data.daysOfWeek).toEqual([1, 3]);
  });

  it('remover regra marca a data, não apaga', async () => {
    const prisma = prismaFalso();
    await servico(prisma).removerRegra('r1');
    expect(prisma.escalaRegra.update.mock.calls[0][0].data.deletedAt).toBeInstanceOf(Date);
  });

  it('regra inexistente dá 404', async () => {
    const prisma = prismaFalso();
    prisma.escalaRegra.findFirst.mockResolvedValue(null);
    await expect(servico(prisma).removerRegra('r1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('EscalaService — exceções', () => {
  const base = { regraId: 'r1', date: '2026-09-21' };

  it('troca sem substituto é recusada', async () => {
    await expect(
      servico(prismaFalso()).registrarExcecao('admin', { ...base, tipo: 'TROCA' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('recorte pela metade (só início) é recusado', async () => {
    await expect(
      servico(prismaFalso()).registrarExcecao('admin', {
        ...base,
        tipo: 'FOLGA',
        startTime: '02:00',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('registrar de novo substitui a exceção do dia, na mesma transação', async () => {
    const prisma = prismaFalso();
    await servico(prisma).registrarExcecao('admin', {
      ...base,
      tipo: 'TROCA',
      substituteUserId: 'u-bia',
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(['apagar', 'criar']);
  });

  it('folga ignora substituto que venha junto', async () => {
    const prisma = prismaFalso();
    await servico(prisma).registrarExcecao('admin', {
      ...base,
      tipo: 'FOLGA',
      substituteUserId: 'u-bia',
    });
    expect(prisma.escalaExcecao.create.mock.calls[0][0].data.substituteUserId).toBeNull();
  });
});
