import type { PrismaClient } from '@prisma/client';
import {
  createEmailReplyCommunication,
  isReopenableStage,
  saoPauloDateTime,
  senderCanReopenTicket,
  senderCanReplyToTicket,
} from './email-reply-communication';

function prismaMock(overrides: {
  watcher?: unknown;
  memberships?: Array<{ companyId: string }>;
  company?: unknown;
}) {
  return {
    portalTicketWatcher: {
      findFirst: jest.fn().mockResolvedValue(overrides.watcher ?? null),
    },
    userCompany: {
      findMany: jest.fn().mockResolvedValue(overrides.memberships ?? []),
    },
    company: {
      findFirst: jest.fn().mockResolvedValue(overrides.company ?? null),
    },
  } as unknown as PrismaClient;
}

const ticket = {
  ticketNumber: 100,
  requestorEmail: 'Cliente@Empresa.com',
  clientExternalId: 55,
};

describe('saoPauloDateTime', () => {
  it('converte UTC para o horário de Brasília', () => {
    expect(saoPauloDateTime(new Date('2026-09-16T21:37:01Z'))).toEqual({
      date: '2026-09-16',
      time: '18:37',
    });
  });

  it('vira o dia corretamente perto da meia-noite', () => {
    expect(saoPauloDateTime(new Date('2026-09-17T02:10:00Z'))).toEqual({
      date: '2026-09-16',
      time: '23:10',
    });
  });
});

describe('isReopenableStage', () => {
  it('não reabre cancelado', () => {
    expect(isReopenableStage('Cancelado')).toBe(false);
  });
  it('reabre resolvido e encerrado', () => {
    expect(isReopenableStage('Resolvido')).toBe(true);
    expect(isReopenableStage('Encerrado')).toBe(true);
  });
});

describe('senderCanReopenTicket', () => {
  it('reabre quando é o solicitante (sem diferenciar maiúsculas)', async () => {
    await expect(
      senderCanReopenTicket(prismaMock({}), {
        fromEmail: 'cliente@empresa.com',
        sender: null,
        routeCompanyId: null,
        ticket,
      }),
    ).resolves.toBe(true);
  });

  it('reabre quando é seguidor', async () => {
    await expect(
      senderCanReopenTicket(prismaMock({ watcher: { id: 'w' } }), {
        fromEmail: 'outro@empresa.com',
        sender: null,
        routeCompanyId: null,
        ticket,
      }),
    ).resolves.toBe(true);
  });

  it('reabre quando é usuário da empresa do ticket', async () => {
    await expect(
      senderCanReopenTicket(prismaMock({ company: { id: 'c1' } }), {
        fromEmail: 'gestor@empresa.com',
        sender: { userId: 'u1', role: 'CLIENT_GESTOR', companyId: 'c1' },
        routeCompanyId: null,
        ticket,
      }),
    ).resolves.toBe(true);
  });

  it('não reabre para remetente sem vínculo com o ticket', async () => {
    await expect(
      senderCanReopenTicket(prismaMock({}), {
        fromEmail: 'estranho@outra.com',
        sender: null,
        routeCompanyId: null,
        ticket,
      }),
    ).resolves.toBe(false);
  });

  it('não reabre para usuário de outra empresa', async () => {
    const prisma = prismaMock({ company: null });
    await expect(
      senderCanReopenTicket(prisma, {
        fromEmail: 'alguem@outra.com',
        sender: { userId: 'u2', role: 'CLIENT_MEMBER', companyId: 'c2' },
        routeCompanyId: null,
        ticket,
      }),
    ).resolves.toBe(false);
  });

  it('não reabre para equipe interna, mesmo sendo o solicitante', async () => {
    await expect(
      senderCanReopenTicket(prismaMock({}), {
        fromEmail: 'cliente@empresa.com',
        sender: { userId: 'u3', role: 'COLLABORATOR', companyId: null },
        routeCompanyId: null,
        ticket,
      }),
    ).resolves.toBe(false);
  });
});

describe('createEmailReplyCommunication', () => {
  it('não duplica quando o e-mail já virou comunicação', async () => {
    const create = jest.fn();
    const prisma = {
      portalTicketAppointment: {
        findUnique: jest.fn().mockResolvedValue({ id: 'existente' }),
        create,
      },
    } as unknown as PrismaClient;

    await expect(
      createEmailReplyCommunication(prisma, {
        ticketNumber: 1,
        preTicketId: 'p1',
        fromName: 'Cliente',
        fromEmail: 'c@x.com',
        html: '<p>oi</p>',
        text: 'oi',
        receivedAt: new Date(),
        authorUserId: 'u1',
      }),
    ).resolves.toEqual({ id: 'existente', created: false });
    expect(create).not.toHaveBeenCalled();
  });

  it('grava como comunicação: hora zerada, atenção e sem e-mail de volta', async () => {
    const create = jest.fn().mockResolvedValue({});
    const prisma = {
      portalTicketAppointment: {
        findUnique: jest.fn().mockResolvedValue(null),
        create,
      },
      preTicketAttachment: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as PrismaClient;

    await createEmailReplyCommunication(prisma, {
      ticketNumber: 7,
      preTicketId: 'p2',
      fromName: 'Fulano',
      fromEmail: 'fulano@cliente.com',
      html: null,
      text: 'texto <b>',
      receivedAt: new Date('2026-09-16T13:05:00Z'),
      authorUserId: 'sys',
    });

    const data = create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      ticketNumber: 7,
      initTime: '10:05',
      endTime: '10:05',
      notifyClient: false,
      isWarning: true,
      externalAuthorName: 'Fulano',
      externalAuthorEmail: 'fulano@cliente.com',
      sourcePreTicketId: 'p2',
    });
    // Texto puro é escapado.
    expect(data.description).toContain('texto &lt;b&gt;');
  });
});

describe('senderCanReplyToTicket', () => {
  it('equipe interna responde chamado aberto', async () => {
    await expect(
      senderCanReplyToTicket(prismaMock({}), {
        fromEmail: 'tecnico@alletecnologia.com',
        sender: { userId: 'u1', role: 'COLLABORATOR', companyId: null },
        routeCompanyId: null,
        ticket,
      }),
    ).resolves.toBe(true);
  });

  it('solicitante responde chamado aberto', async () => {
    await expect(
      senderCanReplyToTicket(prismaMock({}), {
        fromEmail: 'cliente@empresa.com',
        sender: null,
        routeCompanyId: null,
        ticket,
      }),
    ).resolves.toBe(true);
  });

  it('pessoa de outra empresa não entra no chamado, mesmo com #número no assunto', async () => {
    await expect(
      senderCanReplyToTicket(prismaMock({ company: null }), {
        fromEmail: 'alguem@outraempresa.com',
        sender: { userId: 'u9', role: 'CLIENT_MEMBER', companyId: 'outra' },
        routeCompanyId: null,
        ticket,
      }),
    ).resolves.toBe(false);
  });

  it('remetente desconhecido não entra no chamado', async () => {
    await expect(
      senderCanReplyToTicket(prismaMock({}), {
        fromEmail: 'estranho@qualquer.com',
        sender: null,
        routeCompanyId: null,
        ticket,
      }),
    ).resolves.toBe(false);
  });
});
