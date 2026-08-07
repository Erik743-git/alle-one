import { createHmac, randomInt } from 'crypto';

const RESET_CODE_LENGTH = 8;
const RESET_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function trimPublicBaseUrl(url: string): string {
  return url.replace(/\/$/, '');
}

function isLoopbackOrigin(url: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(url);
}

export function getFrontendBaseUrl(): string {
  const portalPublic = process.env.PORTAL_PUBLIC_URL?.trim();
  if (portalPublic) {
    return trimPublicBaseUrl(portalPublic);
  }

  const frontend = process.env.FRONTEND_URL?.trim();
  const rejectLoopbackInProd =
    process.env.NODE_ENV === 'production' &&
    frontend &&
    isLoopbackOrigin(frontend);

  if (frontend && !rejectLoopbackInProd) {
    return trimPublicBaseUrl(frontend);
  }

  const apiPublic = process.env.API_PUBLIC_URL?.trim();
  if (apiPublic && !isLoopbackOrigin(apiPublic)) {
    return trimPublicBaseUrl(apiPublic);
  }

  const oauthCallback = process.env.AUTH_OAUTH_CALLBACK_BASE_URL?.trim();
  if (oauthCallback && !isLoopbackOrigin(oauthCallback)) {
    return trimPublicBaseUrl(oauthCallback);
  }

  return trimPublicBaseUrl(frontend || 'http://localhost:3000');
}

export function generatePasswordResetCode(): string {
  let code = '';
  for (let i = 0; i < RESET_CODE_LENGTH; i += 1) {
    code += RESET_CODE_ALPHABET[randomInt(0, RESET_CODE_ALPHABET.length)];
  }
  return code;
}

export function normalizeResetTokenInput(token: string): string {
  return token.trim().replace(/\s+/g, '').toUpperCase();
}

function getResetPepper(): string {
  const pepper =
    process.env.PASSWORD_RESET_PEPPER?.trim() ||
    process.env.JWT_SECRET?.trim() ||
    '';
  if (!pepper) {
    throw new Error(
      'JWT_SECRET (ou PASSWORD_RESET_PEPPER) é obrigatório para tokens de redefinição.',
    );
  }
  return pepper;
}

export function hashPasswordResetCode(code: string): string {
  const normalized = normalizeResetTokenInput(code);
  return createHmac('sha256', getResetPepper())
    .update(normalized)
    .digest('hex');
}

export async function delayResetGuard(ms = 400): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
