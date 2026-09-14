import {
  emailInboundIgnoreBefore,
  isSenderBlocked,
  parseBlockedSenders,
} from './email-inbound-ingest.service';

describe('email inbound corte por data', () => {
  it('lê data ISO com fuso', () => {
    expect(
      emailInboundIgnoreBefore('2026-09-14T15:00:00-03:00')?.toISOString(),
    ).toBe('2026-09-14T18:00:00.000Z');
  });

  it('vazio ou inválido desliga o corte', () => {
    expect(emailInboundIgnoreBefore(undefined)).toBeNull();
    expect(emailInboundIgnoreBefore('  ')).toBeNull();
    expect(emailInboundIgnoreBefore('ontem')).toBeNull();
  });
});

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
