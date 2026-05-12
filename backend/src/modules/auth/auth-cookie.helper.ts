import type { Response } from 'express';
import { ACCESS_TOKEN_COOKIE } from './auth.constants';

function parseSameSite(
  raw: string | undefined,
): 'strict' | 'lax' | 'none' | boolean {
  const v = raw?.trim().toLowerCase();
  if (v === 'strict' || v === 'lax' || v === 'none') {
    return v;
  }
  return 'lax';
}

export function jwtCookieMaxAgeMs(): number {
  const raw = process.env.JWT_EXPIRES_IN?.trim() || '1d';
  const m = /^(\d+)([smhd])$/i.exec(raw);
  if (!m) {
    return 86_400_000;
  }
  const n = Number(m[1]);
  const u = m[2].toLowerCase();
  const mult =
    u === 's' ? 1000 : u === 'm' ? 60_000 : u === 'h' ? 3_600_000 : 86_400_000;
  return Math.min(n * mult, 30 * 86_400_000);
}

export function attachAccessTokenCookie(
  res: Response,
  accessToken: string,
): void {
  const isProd = process.env.NODE_ENV === 'production';
  const domain = process.env.AUTH_COOKIE_DOMAIN?.trim();
  const sameSite = parseSameSite(process.env.AUTH_COOKIE_SAMESITE);
  const secure = isProd || sameSite === 'none';

  res.cookie(ACCESS_TOKEN_COOKIE, accessToken, {
    httpOnly: true,
    secure,
    sameSite,
    path: '/',
    maxAge: jwtCookieMaxAgeMs(),
    ...(domain ? { domain } : {}),
  });
}

export function clearAccessTokenCookie(res: Response): void {
  const isProd = process.env.NODE_ENV === 'production';
  const domain = process.env.AUTH_COOKIE_DOMAIN?.trim();
  const sameSite = parseSameSite(process.env.AUTH_COOKIE_SAMESITE);
  const secure = isProd || sameSite === 'none';

  res.clearCookie(ACCESS_TOKEN_COOKIE, {
    httpOnly: true,
    secure,
    sameSite,
    path: '/',
    ...(domain ? { domain } : {}),
  });
}
