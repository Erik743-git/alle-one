import {
  getTifluxPortalDeskName,
  isAlleOneTifluxDesk,
} from './tiflux-portal-desk.config';

describe('tiflux-portal-desk.config', () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
    delete process.env.TIFLUX_PORTAL_DESK_ID;
    delete process.env.TIFLUX_PORTAL_DESK_NAME;
  });

  afterAll(() => {
    process.env = env;
  });

  it('usa AlleOne como nome padrão', () => {
    expect(getTifluxPortalDeskName()).toBe('AlleOne');
  });

  it('identifica mesa pelo nome (case insensitive)', () => {
    expect(isAlleOneTifluxDesk(null, 'AlleOne')).toBe(true);
    expect(isAlleOneTifluxDesk(null, 'alleone')).toBe(true);
    expect(isAlleOneTifluxDesk(null, 'Outra Mesa')).toBe(false);
  });

  it('aceita ID configurado ou nome da mesa AlleOne', () => {
    process.env.TIFLUX_PORTAL_DESK_ID = '42';
    expect(isAlleOneTifluxDesk(42, 'Outra Mesa')).toBe(true);
    expect(isAlleOneTifluxDesk(99, 'AlleOne')).toBe(true);
    expect(isAlleOneTifluxDesk(99, 'Outra Mesa')).toBe(false);
  });
});
