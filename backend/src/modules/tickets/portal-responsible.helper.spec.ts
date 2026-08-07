import {
  portalResponsibleSyntheticId,
  resolveResponsibleExternalId,
  PORTAL_RESPONSIBLE_ID_BASE,
} from './portal-responsible.helper';

describe('portal-responsible.helper', () => {
  it('usa id TiFlux quando válido', () => {
    expect(resolveResponsibleExternalId('uuid', 42)).toBe(42);
  });

  it('gera id sintético estável na faixa portal', () => {
    const a = portalResponsibleSyntheticId('user-aaa');
    const b = portalResponsibleSyntheticId('user-aaa');
    const c = portalResponsibleSyntheticId('user-bbb');
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(PORTAL_RESPONSIBLE_ID_BASE);
    expect(a).not.toBe(c);
  });
});
