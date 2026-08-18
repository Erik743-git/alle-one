import {
  portalResponsibleSyntheticId,
  resolveResponsibleExternalId,
  PORTAL_RESPONSIBLE_ID_BASE,
} from './portal-responsible.helper';

describe('portal-responsible.helper', () => {
  it('usa id TiFlux quando válido', () => {
    expect(resolveResponsibleExternalId('uuid', 42)).toBe(42);
  });

  it('gera id sintético estável na faixa portal e cabe em INT4', () => {
    const a = portalResponsibleSyntheticId('user-aaa');
    const b = portalResponsibleSyntheticId('user-aaa');
    const c = portalResponsibleSyntheticId('user-bbb');
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(PORTAL_RESPONSIBLE_ID_BASE);
    expect(a).toBeLessThanOrEqual(2_147_483_647);
    expect(a).not.toBe(c);
    expect(
      portalResponsibleSyntheticId('00000000-0000-4000-8000-000000000000'),
    ).toBeLessThanOrEqual(2_147_483_647);
  });

  it('não usa id TiFlux que estoura INT4', () => {
    const id = resolveResponsibleExternalId('user-aaa', 2_186_937_963);
    expect(id).toBe(portalResponsibleSyntheticId('user-aaa'));
    expect(id).toBeLessThanOrEqual(2_147_483_647);
  });
});
