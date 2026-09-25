import { BadRequestException, NotFoundException } from '@nestjs/common';

import type { AuthenticatedRequestUser } from '../auth/auth-request-user';
import { ManutencaoService } from './manutencao.service';

const EMPRESA = 'a1b2c3d4-0000-4000-8000-000000000001';

const RECORRENTE = {
  companyId: EMPRESA,
  recorrente: true,
  daysOfWeek: [2, 2, 4],
  startTime: '22:00',
  endTime: '06:00',
  responsavel: 'ALLE' as const,
  observacoes: '  Não reiniciar o ERP antes das 23h.  ',
};

function prismaFalso(over: { gmuds?: unknown[]; janelas?: unknown[] } = {}) {
  return {
    company: {
      findFirst: jest.fn().mockResolvedValue({ id: EMPRESA }),
    },
    janelaManutencao: {
      create: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          id: 'j1',
          ...data,
          company: { name: 'Cliente' },
        }),
      ),
      findMany: jest.fn().mockResolvedValue(over.janelas ?? []),
      findFirst: jest.fn().mockResolvedValue({ id: 'j1' }),
      update: jest.fn().mockResolvedValue({}),
    },
    gmud: {
      findMany: jest.fn().mockResolvedValue(over.gmuds ?? []),
    },
  };
}

const servico = (prisma: unknown) => new ManutencaoService(prisma as never);

function usuario(
  role: AuthenticatedRequestUser['role'],
  gmudCanView = false,
): AuthenticatedRequestUser {
  return {
    userId: 'u1',
    email: 'u1@alle.test',
    role,
    companyId: null,
    permissions: gmudCanView
      ? [
          {
            module: 'GMUD' as never,
            canView: true,
            canCreate: false,
            canEdit: false,
            canDelete: false,
            canApprove: false,
          },
        ]
      : [],
  };
}

describe('ManutencaoService — janelas', () => {
  it('recorrente: guarda dias sem repetição e observação aparada', async () => {
    const prisma = prismaFalso();
    const saida = await servico(prisma).criarJanela('admin', RECORRENTE);
    const data = prisma.janelaManutencao.create.mock.calls[0][0].data;
    expect(data.daysOfWeek).toEqual([2, 4]);
    expect(data.observacoes).toBe('Não reiniciar o ERP antes das 23h.');
    expect(data.inicio).toBeNull();
    expect(data.createdBy).toBe('admin');
    expect(saida.companyName).toBe('Cliente');
  });

  it('recorrente sem dia, ou com início igual ao fim, é recusada', async () => {
    const s = servico(prismaFalso());
    await expect(
      s.criarJanela('admin', { ...RECORRENTE, daysOfWeek: [] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      s.criarJanela('admin', { ...RECORRENTE, endTime: '22:00' }),
    ).rejects.toThrow(/duração/);
  });

  it('avulsa: fim antes do início ou longa demais é recusada', async () => {
    const s = servico(prismaFalso());
    const avulsa = {
      companyId: EMPRESA,
      recorrente: false,
      responsavel: 'CLIENTE' as const,
    };
    await expect(
      s.criarJanela('admin', {
        ...avulsa,
        inicio: '2026-09-25T22:00:00-03:00',
        fim: '2026-09-25T20:00:00-03:00',
      }),
    ).rejects.toThrow(/depois do início/);
    await expect(
      s.criarJanela('admin', {
        ...avulsa,
        inicio: '2026-09-01T00:00:00-03:00',
        fim: '2026-11-01T00:00:00-03:00',
      }),
    ).rejects.toThrow(/no máximo/);
  });

  it('empresa inexistente é recusada', async () => {
    const prisma = prismaFalso();
    prisma.company.findFirst.mockResolvedValue(null);
    await expect(
      servico(prisma).criarJanela('admin', RECORRENTE),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ManutencaoService — calendário', () => {
  // Terça 22/09/2026, 23h em Brasília = 02h UTC de quarta.
  const gmud = {
    id: 'g1',
    code: 7,
    title: 'Troca do firewall',
    status: 'APPROVED',
    companyId: EMPRESA,
    company: { name: 'Cliente' },
    downtime: false,
    downtimeStart: null,
    downtimeEnd: null,
    activities: [
      { scheduledAt: new Date('2026-09-23T02:00:00Z'), durationMinutes: 60 },
    ],
  };
  const janela = {
    id: 'j1',
    companyId: EMPRESA,
    company: { name: 'Cliente' },
    recorrente: true,
    daysOfWeek: [2],
    startTime: '22:00',
    endTime: '06:00',
    validFrom: null,
    validTo: null,
    inicio: null,
    fim: null,
    responsavel: 'ALLE',
    observacoes: null,
  };

  it('período invertido ou longo demais é recusado', async () => {
    const s = servico(prismaFalso());
    await expect(
      s.calendario(usuario('ADMIN'), '2026-09-30', '2026-09-01'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      s.calendario(usuario('ADMIN'), '2026-09-01', '2026-12-01'),
    ).rejects.toThrow(/no máximo/);
  });

  it('GMUD dentro da janela noturna sai como DENTRO', async () => {
    const prisma = prismaFalso({ gmuds: [gmud], janelas: [janela] });
    const r = await servico(prisma).calendario(
      usuario('ADMIN'),
      '2026-09-21',
      '2026-09-27',
    );
    expect(r.gmuds[0].situacao).toBe('DENTRO');
    expect(r.janelas).toHaveLength(1);
  });

  it('GMUD à tarde sai como FORA, com o pedaço fora', async () => {
    const tarde = {
      ...gmud,
      activities: [
        // 15h de terça em Brasília.
        { scheduledAt: new Date('2026-09-22T18:00:00Z'), durationMinutes: 30 },
      ],
    };
    const prisma = prismaFalso({ gmuds: [tarde], janelas: [janela] });
    const r = await servico(prisma).calendario(
      usuario('ADMIN'),
      '2026-09-21',
      '2026-09-27',
    );
    expect(r.gmuds[0].situacao).toBe('FORA');
    expect(r.gmuds[0].fora).toEqual([
      { inicio: '2026-09-22T18:00:00.000Z', fim: '2026-09-22T18:30:00.000Z' },
    ]);
  });

  it('colaborador vê só as GMUDs de que participa', async () => {
    const prisma = prismaFalso();
    await servico(prisma).calendario(
      usuario('COLLABORATOR', true),
      '2026-09-21',
      '2026-09-27',
    );
    const where = prisma.gmud.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual(
      expect.arrayContaining([{ responsibleId: 'u1' }, { createdBy: 'u1' }]),
    );
  });

  it('colaborador sem o módulo GMUD não recebe GMUD nenhuma', async () => {
    const prisma = prismaFalso({ gmuds: [gmud] });
    const r = await servico(prisma).calendario(
      usuario('COLLABORATOR', false),
      '2026-09-21',
      '2026-09-27',
    );
    expect(prisma.gmud.findMany).not.toHaveBeenCalled();
    expect(r.gmuds).toEqual([]);
  });
});
