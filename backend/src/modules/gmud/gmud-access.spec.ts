import {
  gmudParticipationWhere,
  seesGmudsByParticipationOnly,
  userParticipatesInGmud,
} from './gmud-access';

describe('gmud-access', () => {
  it('restringe listagem por participação para colaborador e PJ', () => {
    expect(seesGmudsByParticipationOnly('COLLABORATOR')).toBe(true);
    expect(seesGmudsByParticipationOnly('PJ')).toBe(true);
    expect(seesGmudsByParticipationOnly('ADMIN')).toBe(false);
    expect(seesGmudsByParticipationOnly('CLIENT')).toBe(false);
  });

  it('monta filtro OR de participação', () => {
    expect(gmudParticipationWhere('u1')).toEqual({
      OR: [
        { responsibleId: 'u1' },
        { createdBy: 'u1' },
        { executors: { some: { userId: 'u1' } } },
        { approvers: { some: { userId: 'u1' } } },
      ],
    });
  });

  it('detecta participação por papel na GMUD', () => {
    const base = {
      createdBy: 'other',
      responsibleId: null,
      executors: [] as Array<{ user: { id: string } }>,
      approvers: [] as Array<{ user: { id: string } }>,
    };

    expect(
      userParticipatesInGmud('u1', {
        ...base,
        responsibleId: 'u1',
      }),
    ).toBe(true);

    expect(
      userParticipatesInGmud('u1', {
        ...base,
        executors: [{ user: { id: 'u1' } }],
      }),
    ).toBe(true);

    expect(
      userParticipatesInGmud('u1', {
        ...base,
        approvers: [{ user: { id: 'u1' } }],
      }),
    ).toBe(true);

    expect(
      userParticipatesInGmud('u1', {
        ...base,
        createdBy: 'u1',
      }),
    ).toBe(true);

    expect(userParticipatesInGmud('u1', base)).toBe(false);
  });
});
