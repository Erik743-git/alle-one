import { htmlParaTexto } from './html-para-texto';

/**
 * O #81743 chegou com 254 caracteres: a descrição vinha do `bodyPreview` do
 * Graph, que para em 255. O corpo inteiro estava guardado, mas os conversores
 * trocavam `\s+` por um espaço só e transformavam a mensagem num parágrafo
 * corrido — o que tornava a troca inútil.
 */
describe('htmlParaTexto', () => {
  it('mantém a estrutura de uma mensagem do Outlook', () => {
    const html = `
      <html><head><style>p { margin: 0 }</style></head><body>
      <p>Ol&aacute;, pessoal.</p>
      <p>Precisamos criar um novo ambiente REST exclusivo para
      desenvolvimento e testes no Protheus.</p>
      <p>Dessa forma, precisamos do apoio da Alle para:</p>
      <ol><li>Verificar e disponibilizar uma porta livre;</li>
      <li>Apoiar na configura&ccedil;&atilde;o do novo ambiente REST.</li></ol>
      <p>Atenciosamente,<br>Bianca Bitencourt</p>
      </body></html>`;

    const texto = htmlParaTexto(html);
    const linhas = texto.split('\n').filter((l) => l.trim());

    expect(linhas[0]).toBe('Olá, pessoal.');
    expect(texto).toContain('• Verificar e disponibilizar uma porta livre;');
    expect(texto).toContain('• Apoiar na configuração do novo ambiente REST.');
    // O <br> antes da assinatura tem de sobreviver.
    expect(texto).toContain('Atenciosamente,\nBianca Bitencourt');
    // E o conteúdo da <style> não pode vazar para o texto.
    expect(texto).not.toContain('margin');
  });

  it('não deixa o texto virar um parágrafo só', () => {
    const texto = htmlParaTexto('<p>Primeira</p><p>Segunda</p><p>Terceira</p>');
    expect(texto).toBe('Primeira\nSegunda\nTerceira');
  });

  it('colapsa espaço horizontal sem comer a quebra de linha', () => {
    expect(htmlParaTexto('<p>a     b</p><p>c</p>')).toBe('a b\nc');
  });

  it('não empilha linhas em branco', () => {
    const texto = htmlParaTexto('<p>a</p><br><br><br><p>b</p>');
    expect(texto).toBe('a\n\nb');
  });

  it('decodifica as entidades mais comuns', () => {
    expect(htmlParaTexto('<p>Ant&ocirc;nio &amp; Silva &lt;a&gt;</p>')).toBe(
      'Antônio & Silva <a>',
    );
  });

  it('devolve vazio para entrada vazia ou nula', () => {
    expect(htmlParaTexto(null)).toBe('');
    expect(htmlParaTexto(undefined)).toBe('');
    expect(htmlParaTexto('   ')).toBe('');
  });
});
