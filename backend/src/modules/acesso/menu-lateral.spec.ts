import { normalizarPreferencia } from './menu-lateral';

describe('normalizarPreferencia', () => {
  it('mantém só chaves conhecidas, sem repetir', () => {
    expect(
      normalizarPreferencia({
        ordem: ['tickets', 'admin', 'tickets', 'gmud', 3],
        visivel: { mural: false, admin: false, gmud: 'sim', tickets: true },
      }),
    ).toEqual({
      ordem: ['tickets', 'gmud'],
      visivel: { mural: false, tickets: true },
    });
  });

  it('entrada vazia ou estranha vira preferência vazia', () => {
    expect(normalizarPreferencia(null)).toEqual({ ordem: [], visivel: {} });
    expect(normalizarPreferencia({ ordem: 'x', visivel: [] })).toEqual({
      ordem: [],
      visivel: {},
    });
  });
});
