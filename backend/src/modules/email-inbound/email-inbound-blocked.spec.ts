import {
  isSenderBlocked,
  parseBlockedSenders,
} from './email-inbound-ingest.service';

describe('email inbound blocked senders', () => {
  it('parseia linhas e vírgulas', () => {
    expect(parseBlockedSenders('a@x.com\n*@y.com, z@w.com')).toEqual([
      'a@x.com',
      '*@y.com',
      'z@w.com',
    ]);
  });

  it('bloqueia e-mail exato e domínio', () => {
    const raw = 'noreply@empresa.com\n*@newsletter.com\n@alertas.io';
    expect(isSenderBlocked('noreply@empresa.com', raw)).toBe(true);
    expect(isSenderBlocked('foo@newsletter.com', raw)).toBe(true);
    expect(isSenderBlocked('x@alertas.io', raw)).toBe(true);
    expect(isSenderBlocked('cliente@outra.com', raw)).toBe(false);
  });
});
