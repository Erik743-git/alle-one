import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import type { Response } from 'express';
import { getFrontendBaseUrl } from './password-reset.helper';

export const OAUTH_STATE_COOKIE = 'alleone_oauth_state';
export type OAuthProvider = 'google' | 'microsoft';

export type OAuthStatePayload = {
  provider: OAuthProvider;
  nonce: string;
  emailHint?: string;
  exp: number;
};

function oauthStateSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) {
    throw new Error('JWT_SECRET é obrigatório para OAuth.');
  }
  return secret;
}

function signOAuthState(payload: OAuthStatePayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', oauthStateSecret())
    .update(body)
    .digest('base64url');
  return `${body}.${sig}`;
}

export function parseOAuthState(
  raw: string | undefined,
): OAuthStatePayload | null {
  if (!raw?.includes('.')) return null;
  const [body, sig] = raw.split('.', 2);
  const expected = createHmac('sha256', oauthStateSecret())
    .update(body)
    .digest('base64url');
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return null;
    }
  } catch {
    return null;
  }
  try {
    const payload = JSON.parse(
      Buffer.from(body, 'base64url').toString('utf8'),
    ) as OAuthStatePayload;
    if (!payload?.provider || !payload?.nonce || !payload?.exp) {
      return null;
    }
    if (Date.now() > payload.exp) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function createOAuthState(
  provider: OAuthProvider,
  emailHint?: string,
): string {
  const payload: OAuthStatePayload = {
    provider,
    nonce: randomBytes(16).toString('hex'),
    ...(emailHint ? { emailHint } : {}),
    exp: Date.now() + 10 * 60_000,
  };
  return signOAuthState(payload);
}

export function attachOAuthStateCookie(res: Response, state: string): void {
  const secure =
    process.env.AUTH_COOKIE_SECURE?.trim().toLowerCase() !== 'false' &&
    process.env.NODE_ENV === 'production';

  res.cookie(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/auth',
    maxAge: 10 * 60_000,
  });
}

export function clearOAuthStateCookie(res: Response): void {
  const secure =
    process.env.AUTH_COOKIE_SECURE?.trim().toLowerCase() !== 'false' &&
    process.env.NODE_ENV === 'production';

  res.clearCookie(OAUTH_STATE_COOKIE, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/auth',
  });
}

function trimPublicBaseUrl(url: string): string {
  return url.replace(/\/$/, '');
}

/** Evita usar localhost do FRONTEND_URL como callback (dev usa AUTH_OAUTH_CALLBACK_BASE_URL ou API direta). */
function isLoopbackOrigin(url: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(url);
}

export function getOAuthCallbackBaseUrl(): string {
  const explicit = process.env.AUTH_OAUTH_CALLBACK_BASE_URL?.trim();
  if (explicit) {
    return trimPublicBaseUrl(explicit);
  }

  const apiPublic = process.env.API_PUBLIC_URL?.trim();
  if (apiPublic) {
    return trimPublicBaseUrl(apiPublic);
  }

  // Produção (Nginx): /auth no domínio público é repassado para a API na mesma origem.
  const portalPublic = process.env.PORTAL_PUBLIC_URL?.trim();
  if (portalPublic) {
    return trimPublicBaseUrl(portalPublic);
  }

  const frontend = process.env.FRONTEND_URL?.trim();
  if (frontend && !isLoopbackOrigin(frontend)) {
    return trimPublicBaseUrl(frontend);
  }

  const port = process.env.PORT?.trim() || '3002';
  return `http://127.0.0.1:${port}`;
}

export function oauthCallbackUrl(provider: OAuthProvider): string {
  return `${getOAuthCallbackBaseUrl()}/auth/${provider}/callback`;
}

export function oauthEmailsMatch(
  emailHint: string | undefined,
  profileEmail: string,
): boolean {
  const hint = emailHint?.trim();
  if (!hint) return true;
  return hint.toLowerCase() === profileEmail.trim().toLowerCase();
}

export function oauthLoginRedirect(
  error?: string,
  firstAccess?: boolean,
): string {
  const base = getFrontendBaseUrl();
  if (error) {
    return `${base}/login?error=${encodeURIComponent(error)}`;
  }
  if (firstAccess) {
    return `${base}/primeiro-acesso`;
  }
  return `${base}/dashboard`;
}

/** Cookie httpOnly: OAuth autenticou, falta confirmar 2FA. */
export const OAUTH_2FA_PENDING_COOKIE = 'alleone_oauth_2fa';

type OAuth2faPendingPayload = {
  sub: string;
  exp: number;
};

function signOAuth2faPending(body: string): string {
  return createHmac('sha256', oauthStateSecret())
    .update(body)
    .digest('base64url');
}

export function createOAuth2faPendingToken(userId: string): string {
  const payload: OAuth2faPendingPayload = {
    sub: userId,
    exp: Date.now() + 10 * 60_000,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${signOAuth2faPending(body)}`;
}

export function parseOAuth2faPendingToken(
  raw: string | undefined,
): { userId: string } | null {
  if (!raw?.includes('.')) return null;
  const [body, sig] = raw.split('.', 2);
  const expected = signOAuth2faPending(body);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return null;
    }
  } catch {
    return null;
  }
  try {
    const payload = JSON.parse(
      Buffer.from(body, 'base64url').toString('utf8'),
    ) as OAuth2faPendingPayload;
    if (!payload?.sub || !payload?.exp || Date.now() > payload.exp) {
      return null;
    }
    return { userId: payload.sub };
  } catch {
    return null;
  }
}

function oauth2faCookieFlags() {
  const secure =
    process.env.AUTH_COOKIE_SECURE?.trim().toLowerCase() !== 'false' &&
    process.env.NODE_ENV === 'production';
  return { secure } as const;
}

export function attachOAuth2faPendingCookie(
  res: Response,
  token: string,
): void {
  const { secure } = oauth2faCookieFlags();
  res.cookie(OAUTH_2FA_PENDING_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 10 * 60_000,
  });
}

export function clearOAuth2faPendingCookie(res: Response): void {
  const { secure } = oauth2faCookieFlags();
  res.clearCookie(OAUTH_2FA_PENDING_COOKIE, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
  });
}
