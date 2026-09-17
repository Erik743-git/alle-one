import { ForbiddenException } from '@nestjs/common';
import type { AuthenticatedRequestUser } from '../auth/auth-request-user';
import { TicketsService } from './tickets.service';
import type { UpdateTicketDto } from './tickets-create.dto';

const CLIENT_ID = 55;

function build(overrides: {
  responsibles?: Array<{ id: number; name: string; email: string | null }>;
  requestor?: { name: string; email: string } | null;
  allowedDesks?: Array<{
    specialty: { externalId: number; active: boolean; deletedAt: null };
  }>;
}) {
  const prisma = {
    portalTicket: {
      findUnique: jest.fn().mockResolvedValue({
        clientExternalId: CLIENT_ID,
        createdBy: 'outro',
        requestorEmail: 'x@cliente.com',
        deskExternalId: 10,
        deskName: 'Infra',
      }),
    },
    company: {
      findFirst: jest.fn().mockResolvedValue({ id: 'comp-1' }),
    },
    companyTicketSpecialty: {
      findMany: jest.fn().mockResolvedValue(overrides.allowedDesks ?? []),
    },
    user: {
      findFirst: jest.fn().mockResolvedValue(overrides.requestor ?? null),
    },
  };
  const catalogs = {
    listResponsiblesForDeskExternalId: jest
      .fn()
      .mockResolvedValue(overrides.responsibles ?? []),
  };
  const tenantScope = {
    resolveTifluxClientIds: jest.fn().mockResolvedValue([CLIENT_ID]),
    resolveAlleTifluxClientId: jest.fn().mockResolvedValue(null),
  };
  const service = new TicketsService(
    prisma as never,
    {} as never,
    catalogs as never,
    {} as never,
    {} as never,
    {} as never,
    tenantScope as never,
    {} as never,
  );
  const check = (actor: AuthenticatedRequestUser, dto: UpdateTicketDto) =>
    (
      service as unknown as {
        assertClientGestorTicketUpdate: (
          a: AuthenticatedRequestUser,
          n: number,
          d: UpdateTicketDto,
        ) => Promise<void>;
      }
    ).assertClientGestorTicketUpdate(actor, 1, dto);
  return { check, catalogs, prisma };
}

const gestor = {
  userId: 'g1',
  email: 'gestor@cliente.com',
  role: 'CLIENT_GESTOR',
  companyId: 'comp-1',
  permissions: [],
} as unknown as AuthenticatedRequestUser;
const member = { ...gestor, role: 'CLIENT_MEMBER' } as AuthenticatedRequestUser;

describe('TicketsService — edição pelo cliente gestor', () => {
  it('cliente funcionário não edita', async () => {
    const { check } = build({});
    await expect(
      check(member, {
        isClosed: true,
        stageName: 'Resolvido',
      } as UpdateTicketDto),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('não altera título nem cliente', async () => {
    const { check } = build({});
    await expect(
      check(gestor, { title: 'x' } as UpdateTicketDto),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      check(gestor, { clientId: 9 } as UpdateTicketDto),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('não muda estágio sem fechar/reabrir', async () => {
    const { check } = build({});
    await expect(
      check(gestor, { stageName: 'Em Atendimento' } as UpdateTicketDto),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('fecha como Resolvido ou Encerrado, não como Cancelado', async () => {
    const { check } = build({});
    const ok = { isClosed: true, stageName: 'Resolvido' } as UpdateTicketDto;
    await expect(check(gestor, ok)).resolves.toBeUndefined();
    expect(ok.statusName).toBe('Resolvido');
    await expect(
      check(gestor, {
        isClosed: true,
        stageName: 'Encerrado',
      } as UpdateTicketDto),
    ).resolves.toBeUndefined();
    await expect(
      check(gestor, {
        isClosed: true,
        stageName: 'Cancelado',
      } as UpdateTicketDto),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('reabre sempre em Novo', async () => {
    const { check } = build({});
    const dto = {
      isClosed: false,
      stageName: 'Em Atendimento',
    } as UpdateTicketDto;
    await check(gestor, dto);
    expect(dto.stageName).toBe('Novo');
  });

  it('responsável só da lista permitida (equipe + empresa) e não pode remover', async () => {
    const { check, catalogs } = build({
      responsibles: [{ id: 7, name: 'Fulano Alle', email: 'f@alle.com' }],
    });
    const dto = { responsibleId: 7 } as UpdateTicketDto;
    await check(gestor, dto);
    expect(dto.responsibleName).toBe('Fulano Alle');
    expect(catalogs.listResponsiblesForDeskExternalId).toHaveBeenCalledWith(
      10,
      'Infra',
      'comp-1',
    );
    await expect(
      check(gestor, { responsibleId: 99 } as UpdateTicketDto),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      check(gestor, { responsibleId: null } as UpdateTicketDto),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('solicitante precisa ser usuário da empresa; nome vem do cadastro', async () => {
    const ok = build({
      requestor: { name: 'Maria Cliente', email: 'maria@cliente.com' },
    });
    const dto = {
      requestorEmail: 'MARIA@cliente.com',
      requestorName: 'qualquer',
    } as UpdateTicketDto;
    await ok.check(gestor, dto);
    expect(dto.requestorName).toBe('Maria Cliente');
    expect(dto.requestorEmail).toBe('maria@cliente.com');

    const fora = build({ requestor: null });
    await expect(
      fora.check(gestor, {
        requestorEmail: 'x@outra.com',
        requestorName: 'X',
      } as UpdateTicketDto),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('mesa só entre as liberadas para a empresa', async () => {
    const { check } = build({
      allowedDesks: [
        { specialty: { externalId: 10, active: true, deletedAt: null } },
      ],
    });
    await expect(
      check(gestor, { deskId: 10 } as UpdateTicketDto),
    ).resolves.toBeUndefined();
    await expect(
      check(gestor, { deskId: 20 } as UpdateTicketDto),
    ).rejects.toThrow('não está liberado');
  });
});
