import { MailService } from './mail.service';

/**
 * O portal lê e envia pelo mesmo endereço. Quando o solicitante do chamado é
 * essa própria caixa — são 5.755 em produção —, o aviso de fechamento voltava
 * para cá, era lido como resposta do solicitante e reabria o chamado (#81667
 * foi fechado e reaberto três vezes assim).
 *
 * Esta trava é o que segura o laço em produção e não tinha teste: o fechamento
 * pela tela só dispara e-mail em chamado de rotina, então um teste manual em
 * chamado comum passa sem exercitar nada disto.
 */
describe('MailService: não manda e-mail para a própria caixa', () => {
  const envOriginal = { ...process.env };
  let service: MailService;
  let graph: { sendMail: jest.Mock };

  beforeEach(() => {
    process.env = { ...envOriginal };
    delete process.env.MAIL_TRANSPORT;
    delete process.env.MAIL_FROM;
    delete process.env.SMTP_USER;
    process.env.MAIL_GRAPH_SENDER = 'suporte@alletecnologia.com';
    graph = {
      sendMail: jest.fn().mockResolvedValue(undefined),
      isConfigured: jest.fn().mockReturnValue(true),
    };
    const prisma = {
      emailInboundSettings: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ graphTenantId: 't', graphClientId: 'c' }),
      },
    };
    service = new MailService(prisma as never, graph as never);
  });

  afterAll(() => {
    process.env = envOriginal;
  });

  it('não envia quando o único destinatário é a própria caixa', async () => {
    const enviado = await service.sendMail({
      to: ['suporte@alletecnologia.com'],
      subject: 'Chamado #76228 encerrado',
      text: 'oi',
    });

    expect(enviado).toBe(false);
    expect(graph.sendMail).not.toHaveBeenCalled();
  });

  it('ignora maiúsculas e nome no endereço', async () => {
    const enviado = await service.sendMail({
      to: 'Suporte Alle <SUPORTE@AlleTecnologia.com>',
      subject: 'Chamado #1 encerrado',
      text: 'oi',
    });

    expect(enviado).toBe(false);
  });

  it('continua enviando para os outros e só tira a própria caixa', async () => {
    process.env.MAIL_TRANSPORT = 'graph';

    const enviado = await service.sendMail({
      to: ['cliente@parati.com.br', 'suporte@alletecnologia.com'],
      cc: ['suporte@alletecnologia.com'],
      subject: 'Chamado #2 encerrado',
      text: 'oi',
    });

    expect(enviado).toBe(true);
    // A caixa segue como remetente (`mailbox`); o que não pode é ela
    // aparecer entre os destinatários.
    const [{ to, cc }] = graph.sendMail.mock.calls[0] as [
      { to: Array<{ address: string }>; cc: Array<{ address: string }> },
    ];
    expect(to.map((d) => d.address)).toEqual(['cliente@parati.com.br']);
    expect(cc).toEqual([]);
  });

  it('não mexe em destinatário que não é a própria caixa', async () => {
    process.env.MAIL_TRANSPORT = 'graph';

    const enviado = await service.sendMail({
      to: ['suporte@outraempresa.com'],
      subject: 'Chamado #3',
      text: 'oi',
    });

    expect(enviado).toBe(true);
    expect(graph.sendMail).toHaveBeenCalled();
  });
});
