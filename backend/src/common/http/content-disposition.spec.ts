import { cabecalhosDeArquivo, podeAbrirInline } from './content-disposition';

describe('cabecalhosDeArquivo', () => {
  it('abre imagem e PDF no navegador quando pedido', () => {
    expect(
      cabecalhosDeArquivo({
        mimeType: 'application/pdf',
        originalName: 'nota.pdf',
        inline: true,
      })['Content-Disposition'],
    ).toBe('inline; filename="nota.pdf"');
  });

  it('HTML, SVG e JS sempre baixam, mesmo pedindo inline', () => {
    for (const mimeType of ['text/html', 'image/svg+xml', 'text/javascript']) {
      const h = cabecalhosDeArquivo({
        mimeType,
        originalName: 'x',
        inline: true,
      });
      expect(h['Content-Disposition']).toMatch(/^attachment;/);
      expect(h['Content-Type']).toBe('application/octet-stream');
    }
  });

  it('ignora parâmetros e maiúsculas no tipo', () => {
    expect(podeAbrirInline('Image/PNG; charset=binary')).toBe(true);
    expect(podeAbrirInline(null)).toBe(false);
  });
});
