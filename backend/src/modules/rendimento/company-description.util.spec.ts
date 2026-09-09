import { summarizeCompanyAppointmentDescription } from './company-description.util';

describe('summarizeCompanyAppointmentDescription', () => {
  it('converte o formato interno em texto legivel', () => {
    const doc =
      '__ALLEONE_DOC_V1__:{"version":1,"blocks":[{"type":"text","content":"teste"}]}';
    const resultado = summarizeCompanyAppointmentDescription(doc);
    expect(resultado.summary).toBe('teste');
    expect(resultado.summary).not.toContain('__ALLEONE_DOC_V1__');
  });

  it('marca imagem do doc sem vazar base64', () => {
    const doc =
      '__ALLEONE_DOC_V1__:{"version":1,"blocks":[{"type":"text","content":"antes"},{"type":"image","content":"data:image/png;base64,AAAA"}]}';
    const resultado = summarizeCompanyAppointmentDescription(doc);
    // O resumo é a primeira linha (comportamento do resumidor); o marcador de
    // imagem aparece no texto completo, mostrado ao expandir.
    expect(resultado.summary).toBe('antes');
    expect(resultado.full).toContain('[imagem]');
    expect(resultado.full).not.toContain('base64');
    expect(resultado.truncated).toBe(true);
  });

  it('remove tags de descricao vinda de e-mail', () => {
    const html = '<div><p>Bom dia,</p><p>segue o retorno.</p></div>';
    const resultado = summarizeCompanyAppointmentDescription(html);
    expect(resultado.summary).toBe('Bom dia, segue o retorno.');
    expect(resultado.summary).not.toContain('<');
  });

  it('mantem texto simples intacto', () => {
    const resultado = summarizeCompanyAppointmentDescription('Backup validado');
    expect(resultado.summary).toBe('Backup validado');
    expect(resultado.truncated).toBe(false);
  });

  it('trata vazio e nulo', () => {
    expect(summarizeCompanyAppointmentDescription(null).summary).toBeNull();
    expect(summarizeCompanyAppointmentDescription('   ').summary).toBeNull();
  });
});
