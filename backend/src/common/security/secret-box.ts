import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

/**
 * Guarda segredo de integração no banco sem deixá-lo legível.
 *
 * Mesmo formato já usado no segredo do 2FA (AES-256-GCM, com o vetor e a
 * etiqueta de autenticação no começo do texto): quem consegue ler a tabela
 * não sai com o token de monitoramento dos clientes.
 */
function encryptionKey(): Buffer {
  const raw =
    process.env.INTEGRATION_ENCRYPTION_KEY?.trim() ||
    process.env.TOTP_ENCRYPTION_KEY?.trim() ||
    process.env.JWT_SECRET?.trim() ||
    'dev-integration-key';
  return createHash('sha256').update(raw).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptSecret(payload: string): string {
  const buf = Buffer.from(payload, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString(
    'utf8',
  );
}

/** Últimos caracteres, para conferir na tela qual token está salvo. */
export function secretHint(plain: string): string {
  const limpo = plain.trim();
  if (limpo.length <= 4) return '••••';
  return `••••${limpo.slice(-4)}`;
}
