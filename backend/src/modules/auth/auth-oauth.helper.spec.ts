import {
  createOAuthState,
  getOAuthCallbackBaseUrl,
  oauthCallbackUrl,
  oauthEmailsMatch,
  parseOAuthState,
  type OAuthProvider,
} from './auth-oauth.helper';

describe('auth-oauth.helper', () => {
  const originalSecret = process.env.JWT_SECRET;

  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret-for-oauth-state-signing';
  });

  afterAll(() => {
    process.env.JWT_SECRET = originalSecret;
  });

  it('cria e valida state assinado', () => {
    const state = createOAuthState('google', 'user@empresa.com');
    const parsed = parseOAuthState(state);
    expect(parsed?.provider).toBe('google');
    expect(parsed?.emailHint).toBe('user@empresa.com');
  });

  it('rejeita state adulterado', () => {
    const state = createOAuthState('microsoft');
    const tampered = `${state}x`;
    expect(parseOAuthState(tampered)).toBeNull();
  });

  it('rejeita provider divergente na validação manual', () => {
    const state = createOAuthState('google');
    const parsed = parseOAuthState(state);
    expect(parsed?.provider).not.toBe('microsoft' satisfies OAuthProvider);
  });

  describe('getOAuthCallbackBaseUrl', () => {
    const envKeys = [
      'AUTH_OAUTH_CALLBACK_BASE_URL',
      'API_PUBLIC_URL',
      'PORTAL_PUBLIC_URL',
      'FRONTEND_URL',
      'PORT',
    ] as const;
    const snapshot: Record<string, string | undefined> = {};

    beforeEach(() => {
      for (const key of envKeys) {
        snapshot[key] = process.env[key];
        delete process.env[key];
      }
    });

    afterEach(() => {
      for (const key of envKeys) {
        if (snapshot[key] === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = snapshot[key];
        }
      }
    });

    it('prioriza AUTH_OAUTH_CALLBACK_BASE_URL', () => {
      process.env.AUTH_OAUTH_CALLBACK_BASE_URL =
        'https://alleone.alletecnologia.com/';
      process.env.PORTAL_PUBLIC_URL = 'https://outro.exemplo.com';
      expect(getOAuthCallbackBaseUrl()).toBe(
        'https://alleone.alletecnologia.com',
      );
    });

    it('usa PORTAL_PUBLIC_URL quando callback explícito não está definido', () => {
      process.env.PORTAL_PUBLIC_URL = 'https://alleone.alletecnologia.com';
      expect(oauthCallbackUrl('google')).toBe(
        'https://alleone.alletecnologia.com/auth/google/callback',
      );
    });

    it('cai em loopback local apenas em dev', () => {
      process.env.PORT = '3002';
      expect(getOAuthCallbackBaseUrl()).toBe('http://127.0.0.1:3002');
    });
  });

  describe('oauthEmailsMatch', () => {
    it('exige hint e compara sem diferenciar maiúsculas', () => {
      expect(oauthEmailsMatch('User@Empresa.com', 'user@empresa.com')).toBe(
        true,
      );
      expect(oauthEmailsMatch(undefined, 'user@empresa.com')).toBe(false);
      expect(oauthEmailsMatch('outro@empresa.com', 'user@empresa.com')).toBe(
        false,
      );
    });
  });
});
