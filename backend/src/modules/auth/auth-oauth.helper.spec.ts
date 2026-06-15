import {
  createOAuthState,
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
});
