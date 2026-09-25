/**
 * Cabeçalhos para entregar um arquivo enviado por usuário.
 *
 * `inline` só vale para tipos que o navegador mostra sem executar nada
 * (imagem rasterizada, PDF, texto puro). O resto sempre baixa: um anexo
 * .html aberto com `?inline=true` virava página do próprio portal, e um .js
 * anexado passava pelo `script-src 'self'` — o script rodava na sessão de
 * quem abrisse o link (auditoria de 24/09).
 */
const TIPOS_SEGUROS_INLINE = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/bmp',
  'application/pdf',
  'text/plain',
]);

export function podeAbrirInline(mimeType: string | null | undefined): boolean {
  const tipo = (mimeType ?? '').split(';')[0].trim().toLowerCase();
  return TIPOS_SEGUROS_INLINE.has(tipo);
}

export function cabecalhosDeArquivo(params: {
  mimeType: string | null | undefined;
  originalName: string;
  inline: boolean;
}): { 'Content-Type': string; 'Content-Disposition': string } {
  const inline = params.inline && podeAbrirInline(params.mimeType);
  // Arquivo que só baixa não precisa do tipo declarado pelo usuário.
  const contentType = inline
    ? params.mimeType || 'application/octet-stream'
    : 'application/octet-stream';
  return {
    'Content-Type': contentType,
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(params.originalName)}"`,
  };
}
