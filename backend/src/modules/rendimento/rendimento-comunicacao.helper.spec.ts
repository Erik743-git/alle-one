import { isComunicacaoSemHoras } from './rendimento-comunicacao.helper';

describe('isComunicacaoSemHoras', () => {
  it('reconhece comunicação: início igual ao fim', () => {
    expect(isComunicacaoSemHoras('13:41', '13:41')).toBe(true);
  });

  it('aceita horário com segundos, comparando só hora e minuto', () => {
    expect(isComunicacaoSemHoras('13:41:00', '13:41:59')).toBe(true);
  });

  it('não esconde apontamento com duração', () => {
    expect(isComunicacaoSemHoras('08:00', '09:30')).toBe(false);
    expect(isComunicacaoSemHoras('13:41', '13:42')).toBe(false);
  });

  it('mantém visível a linha antiga sem horário', () => {
    expect(isComunicacaoSemHoras(null, null)).toBe(false);
    expect(isComunicacaoSemHoras('13:41', null)).toBe(false);
    expect(isComunicacaoSemHoras(null, '13:41')).toBe(false);
    expect(isComunicacaoSemHoras(undefined, undefined)).toBe(false);
  });

  it('não confunde string vazia com horário', () => {
    expect(isComunicacaoSemHoras('', '')).toBe(false);
  });
});
