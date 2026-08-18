import { createHmac, timingSafeEqual } from 'crypto';
import type { Response } from 'express';
import { isAuthCookieSecure } from './auth-cookie.helper';

/** Cookie httpOnly: confiar neste dispositivo e pular 2FA por N dias. */
export const TOTP_TRUST_COOKIE = 'alleone_totp_trust';

const DEFAULT_TRUST_DAYS = 14;

export function totpTrustDays(): number {
  const raw = Number(process.env.TOTP_TRUST_DAYS ?? DEFAULT_TRUST_DAYS);
  if (!Number.isFinite(raw) || raw < 1) return DEFAULT_TRUST_DAYS;
  return Math.min(Math.floor(raw), 30);
}

function trustSecret(): string {
  return (
    process.env.TOTP_ENCRYPTION_KEY?.trim() ||
    process.env.JWT_SECRET?.trim() ||
    'dev-totp-trust'
  );
}

type TrustPayload = {
  sub: string;
  /** totpEnabledAt epoch ms — invalida se o 2FA for reconfigurado */
  te: number;
  exp: number;
};

function b64url(buf: Buffer | string): string {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf, 'utf8');
  return b
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromB64url(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
  return Buffer.from(b64, 'base64');
}

function sign(payloadPart: string): string {
  return b64url(
    createHmac('sha256', trustSecret()).update(payloadPart).digest(),
  );
}

export function createTotpTrustToken(
  userId: string,
  totpEnabledAt: Date,
): string {
  const days = totpTrustDays();
  const payload: TrustPayload = {
    sub: userId,
    te: totpEnabledAt.getTime(),
    exp: Date.now() + days * 86_400_000,
  };
  const payloadPart = b64url(JSON.stringify(payload));
  return `${payloadPart}.${sign(payloadPart)}`;
}

export function verifyTotpTrustToken(
  token: string | undefined,
  userId: string,
  totpEnabledAt: Date | null,
): boolean {
  if (!token || !totpEnabledAt) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payloadPart, sig] = parts;
  const expected = sign(payloadPart);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
    const payload = JSON.parse(
      fromB64url(payloadPart).toString('utf8'),
    ) as TrustPayload;
    if (payload.sub !== userId) return false;
    // Compara em segundos — evita falso negativo por ms do TIMESTAMP no Postgres.
    if (
      Math.floor(Number(payload.te) / 1000) !==
      Math.floor(totpEnabledAt.getTime() / 1000)
    ) {
      return false;
    }
    if (typeof payload.exp !== 'number' || payload.exp < Date.now()) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function cookieFlags() {
  const domain = process.env.AUTH_COOKIE_DOMAIN?.trim();
  // Lax por padrão: o trust precisa sobreviver a redirect pós-sessão expirada.
  // AUTH_COOKIE_SAMESITE ainda sobrescreve se definido.
  const sameSiteRaw = process.env.AUTH_COOKIE_SAMESITE?.trim().toLowerCase();
  const sameSite =
    sameSiteRaw === 'strict' || sameSiteRaw === 'lax' || sameSiteRaw === 'none'
      ? sameSiteRaw
      : 'lax';
  const secure = isAuthCookieSecure(sameSite);
  return { domain, sameSite, secure } as const;
}

export function attachTotpTrustCookie(res: Response, token: string): void {
  const { domain, sameSite, secure } = cookieFlags();
  res.cookie(TOTP_TRUST_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite,
    path: '/',
    maxAge: totpTrustDays() * 86_400_000,
    ...(domain ? { domain } : {}),
  });
}

export function clearTotpTrustCookie(res: Response): void {
  const { domain, sameSite, secure } = cookieFlags();
  res.clearCookie(TOTP_TRUST_COOKIE, {
    httpOnly: true,
    secure,
    sameSite,
    path: '/',
    ...(domain ? { domain } : {}),
  });
}
