import { ForbiddenException } from '@nestjs/common';
import type { AuthenticatedRequestUser } from '../auth/auth-request-user';
import { assertPjTicketScope, pjTicketListWhere } from './tickets-pj-scope';

const actor = {
  userId: 'u-1',
  email: 'terceiro@parceiro.com',
  role: 'PJ',
  permissions: [],
} as unknown as AuthenticatedRequestUser;

const MESA_A = 'mesa-a';
const MESA_B = 'mesa-b';

function ticket(over: Partial<Parameters<typeof assertPjTicketScope>[0]['ticket']>) {
  return {
    clientExternalId: 10,
    specialtyId: MESA_A,
    createdBy: 'outro',
    requestorEmail: 'alguem@cliente.com',
    responsibleExternalId: 999,
    ...over,
  };
}

/** Regra combinada com o usuário: a mesa manda; a empresa só vale sem mesa. */
describe('escopo do terceiro (PJ)', () => {
  it('com mesa: vê a fila da mesa, de qualquer empresa', () => {
    const scope = { clientExternalIds: [], specialtyIds: [MESA_A] };
    expect(() =>
      assertPjTicketScope({ scope, actor, ticket: ticket({ clientExternalId: 77 }) }),
    ).not.toThrow();
  });

  it('com mesa: não vê chamado de outra mesa, mesmo na empresa dele', () => {
    const scope = { clientExternalIds: [10], specialtyIds: [MESA_A] };
    expect(() =>
      assertPjTicketScope({ scope, actor, ticket: ticket({ specialtyId: MESA_B }) }),
    ).toThrow(ForbiddenException);
  });

  it('sem mesa e com empresa: vê os chamados da empresa', () => {
    const scope = { clientExternalIds: [10], specialtyIds: [] };
    expect(() =>
      assertPjTicketScope({ scope, actor, ticket: ticket({ specialtyId: MESA_B }) }),
    ).not.toThrow();
  });

  it('sem mesa e sem empresa: só o que é dele', () => {
    const scope = { clientExternalIds: [], specialtyIds: [] };
    expect(() =>
      assertPjTicketScope({ scope, actor, ticket: ticket({}) }),
    ).toThrow(ForbiddenException);
    expect(() =>
      assertPjTicketScope({
        scope,
        actor,
        ticket: ticket({ createdBy: actor.userId }),
      }),
    ).not.toThrow();
  });

  it('a listagem filtra pela mesa quando ela existe', () => {
    const where = pjTicketListWhere({
      scope: { clientExternalIds: [10], specialtyIds: [MESA_A] },
      actor,
      responsibleExternalId: null,
      watcherTicketNumbers: [],
    });
    expect(JSON.stringify(where.OR)).toContain(MESA_A);
    // Sem AND com a empresa: a mesa sozinha define o alcance.
    expect(JSON.stringify(where.OR)).not.toContain('AND');
  });

  it('a listagem cai para a empresa quando não há mesa', () => {
    const where = pjTicketListWhere({
      scope: { clientExternalIds: [10], specialtyIds: [] },
      actor,
      responsibleExternalId: null,
      watcherTicketNumbers: [],
    });
    expect(JSON.stringify(where.OR)).toContain('clientExternalId');
  });
});
