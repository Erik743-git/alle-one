/**
 * Só o assunto do e-mail liga a mensagem a um chamado existente.
 *
 * Caso real (Parati, 18/09): o cliente abriu um chamado NOVO e, no corpo,
 * citou um chamado antigo ("Após aplicar a mesma linha de solução que você
 * executou em outra base (#56117 - Erro ao tentar abrir a teste hcm-8380)").
 * Como a busca varria assunto + corpo, o portal reabriu o #56117 em vez de
 * abrir o chamado novo.
 */
function extractTicketNumberFromText(text: string): number | null {
  const patterns = [
    /#\s*(\d{1,9})\b/,
    /\bchamado\s*[#:.-]?\s*(\d{1,9})\b/i,
    /\bticket\s*[#:.-]?\s*(\d{1,9})\b/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return null;
}

describe('ligação do e-mail com chamado existente', () => {
  const CORPO_PARATI = [
    'Boa tarde, tudo bem?',
    '',
    '@Marcos Joos, incialmente a mensagem exibida era',
    '"Servidor de aplicação Progress indisponível."',
    '',
    'Após aplicar a mesma linha de solução que você executou em outra base',
    '(#56117 - Erro ao tentar abrir a teste hcm-8380) recebemos o erro abaixo:',
  ].join('\n');

  it('não liga a chamado citado só no corpo do e-mail', () => {
    const assunto = 'Erro interno base de testes Parati 8180 WMS';
    expect(extractTicketNumberFromText(assunto)).toBeNull();
  });

  it('o corpo sozinho acharia o chamado errado (motivo de não usá-lo)', () => {
    expect(extractTicketNumberFromText(CORPO_PARATI)).toBe(56117);
  });

  it('liga quando o número está no assunto da resposta', () => {
    expect(
      extractTicketNumberFromText('Re: Chamado #56117 concluído — teste hcm'),
    ).toBe(56117);
  });

  it('aceita o formato "chamado 12345" no assunto', () => {
    expect(extractTicketNumberFromText('Res: chamado 12345 em aberto')).toBe(
      12345,
    );
  });
});
