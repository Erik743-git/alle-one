import {
  createTotpTrustToken,
  resolveDeviceTrustToken,
  totpTrustDays,
  verifyTotpTrustToken,
} from './totp-trust-cookie.helper';

describe('totp-trust-cookie.helper', () => {
  const userId = 'user-1';
  const enabledAt = new Date('2026-01-15T12:00:00.000Z');

  it('cria token verificável para o mesmo usuário e totpEnabledAt', () => {
    const token = createTotpTrustToken(userId, enabledAt);
    expect(verifyTotpTrustToken(token, userId, enabledAt)).toBe(true);
  });

  it('rejeita token de outro usuário ou 2FA reconfigurado', () => {
    const token = createTotpTrustToken(userId, enabledAt);
    expect(verifyTotpTrustToken(token, 'outro', enabledAt)).toBe(false);
    expect(
      verifyTotpTrustToken(token, userId, new Date('2026-02-01T00:00:00.000Z')),
    ).toBe(false);
  });

  it('aceita totpEnabledAt com diferença só de milissegundos', () => {
    const token = createTotpTrustToken(userId, enabledAt);
    const almostSame = new Date(enabledAt.getTime() + 400);
    expect(verifyTotpTrustToken(token, userId, almostSame)).toBe(true);
  });

  it('resolveDeviceTrustToken prioriza cookie principal', () => {
    expect(
      resolveDeviceTrustToken({
        cookie: 'cookie-token',
        body: 'body-token',
      }),
    ).toBe('cookie-token');
  });

  it('resolveDeviceTrustToken usa hint e header como fallback', () => {
    expect(
      resolveDeviceTrustToken({
        hintCookie: 'hint-token',
      }),
    ).toBe('hint-token');
    expect(
      resolveDeviceTrustToken({
        header: 'header-token',
      }),
    ).toBe('header-token');
  });

  it('rejeita token ausente ou inválido', () => {
    expect(verifyTotpTrustToken(undefined, userId, enabledAt)).toBe(false);
    expect(verifyTotpTrustToken('abc.def', userId, enabledAt)).toBe(false);
    expect(verifyTotpTrustToken('x', userId, null)).toBe(false);
  });

  it('totpTrustDays fica entre 1 e 30', () => {
    const days = totpTrustDays();
    expect(days).toBeGreaterThanOrEqual(1);
    expect(days).toBeLessThanOrEqual(30);
  });
});
