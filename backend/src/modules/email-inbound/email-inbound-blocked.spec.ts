import {
  detectAutomatedMessage,
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

describe('email inbound mensagens automáticas', () => {
  const semCabecalho: Array<{ name?: string; value?: string }> = [];

  it('reconhece o aviso de não entrega do Exchange pelo remetente', () => {
    expect(
      detectAutomatedMessage({
        fromEmail:
          'microsoftexchange329e71ec88ae4615bbc36ab6ce41109e@alletecnologia.com',
        subject:
          'Não é possível entregar: Atualização do chamado #81247 — 16/09/2026',
        headers: semCabecalho,
      }),
    ).toBe('NAO_ENTREGUE');
  });

  it('reconhece não entrega por cabeçalho e por assunto de outros servidores', () => {
    expect(
      detectAutomatedMessage({
        fromEmail: 'qualquer@x.com',
        subject: 'Algo',
        headers: [{ name: 'X-MS-Exchange-Message-Is-Ndr', value: '' }],
      }),
    ).toBe('NAO_ENTREGUE');
    expect(
      detectAutomatedMessage({
        fromEmail: 'MAILER-DAEMON@gmail.com',
        subject: 'Delivery Status Notification (Failure)',
        headers: semCabecalho,
      }),
    ).toBe('NAO_ENTREGUE');
  });

  it('reconhece resposta de ausência', () => {
    expect(
      detectAutomatedMessage({
        fromEmail: 'cliente@empresa.com',
        subject: 'Resposta automática: Atualização do chamado #1',
        headers: semCabecalho,
      }),
    ).toBe('RESPOSTA_AUTOMATICA');
    expect(
      detectAutomatedMessage({
        fromEmail: 'cliente@empresa.com',
        subject: 'RE: chamado #1',
        headers: [{ name: 'Auto-Submitted', value: 'auto-replied' }],
      }),
    ).toBe('RESPOSTA_AUTOMATICA');
  });

  it('não descarta alerta de monitoramento nem assunto escrito por gente', () => {
    expect(
      detectAutomatedMessage({
        fromEmail: 'zabbix@cliente.com',
        subject: 'Monitoramento: servidor fora do ar',
        headers: [{ name: 'Auto-Submitted', value: 'auto-generated' }],
      }),
    ).toBeNull();
    expect(
      detectAutomatedMessage({
        fromEmail: 'cliente@empresa.com',
        subject: 'Falha na entrega do relatório mensal',
        headers: semCabecalho,
      }),
    ).toBeNull();
    expect(
      detectAutomatedMessage({
        fromEmail: 'cliente@empresa.com',
        subject: 'RE: Atualização do chamado #81247',
        headers: semCabecalho,
      }),
    ).toBeNull();
  });
});
