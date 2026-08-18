import { APPOINTMENT_DOC_PREFIX } from './appointment-doc.util';
import { appointmentDescriptionToEmailParts } from './appointment-doc.util';

describe('appointmentDescriptionToEmailParts', () => {
  it('escapa texto simples', () => {
    const parts = appointmentDescriptionToEmailParts('Olá <cliente>');
    expect(parts.html).toContain('Olá &lt;cliente&gt;');
    expect(parts.text).toBe('Olá <cliente>');
    expect(parts.inlineImages).toHaveLength(0);
  });

  it('converte bloco de imagem dataUrl em cid', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64');
    const description =
      APPOINTMENT_DOC_PREFIX +
      JSON.stringify({
        version: 1,
        blocks: [
          { type: 'text', content: '<p>Feito</p>' },
          {
            type: 'image',
            fileIndex: 0,
            dataUrl: `data:image/png;base64,${png}`,
          },
        ],
      });
    const parts = appointmentDescriptionToEmailParts(description);
    expect(parts.html).toContain('<p>Feito</p>');
    expect(parts.html).toContain('cid:alleone-img-1@portal');
    expect(parts.inlineImages).toHaveLength(1);
    expect(parts.inlineImages[0].contentType).toBe('image/png');
    expect(parts.text).toContain('Feito');
    expect(parts.text).toContain('[imagem]');
  });
});
