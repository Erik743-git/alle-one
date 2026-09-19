import { nomeDoBanco } from './assert-expected-database';

describe('nomeDoBanco', () => {
  it('tira o banco da URL, ignorando a query', () => {
    expect(
      nomeDoBanco('postgresql://u:s@127.0.0.1:5432/portal_teste?schema=public'),
    ).toBe('portal_teste');
    expect(nomeDoBanco('postgresql://u:s@127.0.0.1:5432/portal')).toBe('portal');
  });

  it('não confunde produção com teste', () => {
    // O acidente foi exatamente este: a API de teste com a URL de produção.
    expect(
      nomeDoBanco('postgresql://u:s@127.0.0.1:5432/portal?schema=public'),
    ).not.toBe('portal_teste');
  });

  it('devolve nulo quando não dá para saber', () => {
    expect(nomeDoBanco('postgresql://u:s@127.0.0.1:5432/')).toBeNull();
  });
});
