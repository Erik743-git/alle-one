import { createHmac, randomInt } from 'crypto';

const RESET_CODE_LENGTH = 8;
const RESET_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export function getFrontendBaseUrl(): string {
  const raw =
    process.env.FRONTEND_URL?.trim() ||
    process.env.PORTAL_PUBLIC_URL?.trim() ||
    'http://localhost:3000';
  return raw.replace(/\/$/, '');
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
