import { isAuthCookieSecure } from './auth-cookie.helper';

describe('isAuthCookieSecure', () => {
  const keys = ['NODE_ENV', 'AUTH_COOKIE_SECURE', 'TRUST_PROXY'] as const;
  const prev: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of keys) {
      prev[k] = process.env[k];
    }
  });

  afterEach(() => {
    for (const k of keys) {
      if (prev[k] === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = prev[k];
      }
    }
  });

  it('em production sempre Secure, mesmo com AUTH_COOKIE_SECURE=false', () => {
    process.env.NODE_ENV = 'production';
    process.env.AUTH_COOKIE_SECURE = 'false';
    expect(isAuthCookieSecure('lax')).toBe(true);
  });

  it('em development com TRUST_PROXY usa Secure', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.AUTH_COOKIE_SECURE;
    process.env.TRUST_PROXY = '1';
    expect(isAuthCookieSecure('lax')).toBe(true);
  });

  it('em HTTP local permite AUTH_COOKIE_SECURE=false', () => {
    process.env.NODE_ENV = 'development';
    process.env.AUTH_COOKIE_SECURE = 'false';
    delete process.env.TRUST_PROXY;
    expect(isAuthCookieSecure('lax')).toBe(false);
  });
});
