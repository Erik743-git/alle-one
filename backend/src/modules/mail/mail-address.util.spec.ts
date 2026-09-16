import { parseMailAddress, parseMailAddressList } from './mail-address.util';

describe('parseMailAddress', () => {
  it('lê endereço simples', () => {
    expect(parseMailAddress(' ana@x.com ')).toEqual({ address: 'ana@x.com' });
  });

  it('lê nome e endereço, com ou sem aspas', () => {
    expect(parseMailAddress('Alle One <suporte@alle.com>')).toEqual({
      name: 'Alle One',
      address: 'suporte@alle.com',
    });
    expect(parseMailAddress('"Silva, João" <joao@x.com>')).toEqual({
      name: 'Silva, João',
      address: 'joao@x.com',
    });
  });

  it('descarta o que não é e-mail', () => {
    expect(parseMailAddress('')).toBeNull();
    expect(parseMailAddress('sem arroba')).toBeNull();
  });
});

describe('parseMailAddressList', () => {
  it('aceita string com vírgula e ponto e vírgula, sem quebrar nome com vírgula', () => {
    expect(
      parseMailAddressList('a@x.com; "Silva, João" <joao@x.com>, b@x.com'),
    ).toEqual([
      { address: 'a@x.com' },
      { name: 'Silva, João', address: 'joao@x.com' },
      { address: 'b@x.com' },
    ]);
  });

  it('aceita lista, remove repetidos ignorando maiúsculas e itens inválidos', () => {
    expect(
      parseMailAddressList(['A@x.com', 'a@x.com, lixo', undefined as never]),
    ).toEqual([{ address: 'A@x.com' }]);
  });

  it('vazio vira lista vazia', () => {
    expect(parseMailAddressList(undefined)).toEqual([]);
    expect(parseMailAddressList([])).toEqual([]);
  });
});
