import type { Request } from 'express';

/** true quando a API está atrás de proxy confiável (Nginx). */
export function isTrustProxyEnabled(): boolean {
  const raw = process.env.TRUST_PROXY?.trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

/**
 * IP do cliente para auditoria.
 * Com TRUST_PROXY: usa req.ip (Express já aplica XFF com confiança).
 * Sem TRUST_PROXY: ignora X-Forwarded-For (evita spoof) e usa socket.
 */
export function resolveAuditClientIp(req: Request): string | null {
  if (isTrustProxyEnabled()) {
    const fromExpress = typeof req.ip === 'string' ? req.ip.trim() : '';
    if (fromExpress) return fromExpress;
  }

  const remote = req.socket?.remoteAddress?.trim();
  return remote || null;
}
