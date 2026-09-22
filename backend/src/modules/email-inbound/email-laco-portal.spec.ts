import { detectAutomatedMessage } from './email-inbound-ingest.service';
import { PORTAL_SENT_HEADER } from './microsoft-graph-mail.client';

/**
 * Laço do portal consigo mesmo.
 *
 * O portal lê e envia pela mesma caixa (suporte@). Quando um chamado tem
 * essa caixa como solicitante — 5.755 em produção, a maioria de rotina —,
 * o aviso de fechamento voltava, era lido como resposta do solicitante e
 * reabria o chamado. O #81667 foi fechado e reaberto três vezes em 21/09.
 *
 * A defesa é a marca que o envio coloca no cabeçalho, não o remetente:
 * e-mail que uma pessoa encaminha de suporte@ para a caixa não tem a marca
 * e continua virando chamado normalmente.
 */
const CAIXA = 'suporte@alletecnologia.com';

function detectar(params: {
  fromEmail: string;
  subject: string;
  headers?: Array<{ name?: string; value?: string }>;
}) {
  return detectAutomatedMessage({
    fromEmail: params.fromEmail,
    subject: params.subject,
    headers: params.headers ?? [],
  });
}

describe('aviso do próprio portal que voltou para a caixa', () => {
  it('ignora o que tem a marca do portal', () => {
    expect(
      detectar({
        fromEmail: CAIXA,
        subject: 'Chamado #81667 concluído — [ROTINAS] Validação Backup',
        headers: [{ name: PORTAL_SENT_HEADER, value: '1' }],
      }),
    ).toBe('ENVIADO_PELO_PORTAL');
  });

  it('a marca vale mesmo escrita em maiúsculas', () => {
    expect(
      detectar({
        fromEmail: CAIXA,
        subject: 'Seu chamado foi registrado com o numero 81667',
        headers: [{ name: PORTAL_SENT_HEADER.toUpperCase(), value: '1' }],
      }),
    ).toBe('ENVIADO_PELO_PORTAL');
  });

  it('NÃO ignora e-mail encaminhado à mão da mesma caixa', () => {
    // Caso que a primeira tentativa de correção quebraria: o atendente
    // encaminha de suporte@ para a própria caixa para virar chamado.
    expect(
      detectar({
        fromEmail: CAIXA,
        subject: 'ENC: Servidor fora do ar na Tuper',
      }),
    ).toBeNull();
  });

  it('não confunde com e-mail de cliente', () => {
    expect(
      detectar({
        fromEmail: 'jucemar.melo@kellanova.com',
        subject: 'Erro interno base de testes',
      }),
    ).toBeNull();
  });

  it('continua reconhecendo aviso de não entrega', () => {
    expect(
      detectar({
        fromEmail: 'mailer-daemon@alletecnologia.com',
        subject: 'Undeliverable: Chamado #81667',
      }),
    ).toBe('NAO_ENTREGUE');
  });

  it('continua reconhecendo resposta de ausência', () => {
    expect(
      detectar({
        fromEmail: 'alguem@cliente.com',
        subject: 'Resposta automática: Chamado #81667',
      }),
    ).toBe('RESPOSTA_AUTOMATICA');
  });

  it('alerta de monitoramento segue virando chamado', () => {
    // É automático, mas é chamado de verdade — não pode ser ignorado.
    expect(
      detectar({
        fromEmail: 'zabbix@alletecnologia.com',
        subject: 'TUPER - Monitoramento: servidor sem resposta',
        headers: [{ name: 'auto-submitted', value: 'auto-generated' }],
      }),
    ).toBeNull();
  });
});

/** Espelha o filtro do envio: a própria caixa sai da lista. */
function destinatariosValidos(
  lista: string[],
  caixa: string,
): string[] {
  const alvo = caixa.trim().toLowerCase();
  return lista.filter((item) => {
    const endereco = (item.match(/<([^>]+)>/)?.[1] ?? item).trim().toLowerCase();
    return endereco !== alvo;
  });
}

describe('não enviar e-mail para a própria caixa', () => {
  it('tira a caixa da lista de destinatários', () => {
    expect(destinatariosValidos([CAIXA, 'cliente@empresa.com'], CAIXA)).toEqual(
      ['cliente@empresa.com'],
    );
  });

  it('reconhece o formato "Nome <e-mail>"', () => {
    // É assim que o solicitante do #81667 estava gravado.
    expect(
      destinatariosValidos([`Alle One <${CAIXA}>`, 'a@b.com'], CAIXA),
    ).toEqual(['a@b.com']);
  });

  it('ignora diferença de maiúsculas', () => {
    expect(destinatariosValidos(['SUPORTE@ALLETECNOLOGIA.COM'], CAIXA)).toEqual(
      [],
    );
  });

  it('sobra vazio quando só havia a própria caixa', () => {
    // Nesse caso o envio é cancelado: era o e-mail que criava o laço.
    expect(destinatariosValidos([CAIXA], CAIXA)).toEqual([]);
  });

  it('não mexe em destinatário de verdade', () => {
    const lista = ['cliente@empresa.com', 'gestor@empresa.com'];
    expect(destinatariosValidos(lista, CAIXA)).toEqual(lista);
  });
});
