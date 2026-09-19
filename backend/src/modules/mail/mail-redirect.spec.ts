import { MailService } from './mail.service';

/**
 * A base de teste é cópia da de produção, com os e-mails reais dos clientes.
 * `MAIL_REDIRECT_TO` é o que permite testar envio lá sem escrever para eles.
 */
describe('MailService — redirecionamento de teste', () => {
  const original = process.env.MAIL_REDIRECT_TO;

  afterEach(() => {
    if (original === undefined) delete process.env.MAIL_REDIRECT_TO;
    else process.env.MAIL_REDIRECT_TO = original;
  });

  function aplicar(payload: {
    to: string[] | string;
    cc?: string[] | string;
    subject: string;
  }) {
    const service = new MailService({} as never, {} as never);
    return (
      service as unknown as {
        applyTestRedirect: (p: unknown) => {
          to: string | string[];
          cc?: string[] | string;
          subject: string;
        };
      }
    ).applyTestRedirect({ ...payload, text: 'corpo' });
  }

  it('sem a variável, não mexe no destinatário', () => {
    delete process.env.MAIL_REDIRECT_TO;

    const saida = aplicar({
      to: ['cliente@empresa.com'],
      subject: 'Chamado #1 concluído',
    });

    expect(saida.to).toEqual(['cliente@empresa.com']);
    expect(saida.subject).toBe('Chamado #1 concluído');
  });

  it('com a variável, tudo vai para o endereço de teste', () => {
    process.env.MAIL_REDIRECT_TO = 'teste@alletecnologia.com';

    const saida = aplicar({
      to: ['cliente@empresa.com'],
      cc: ['chefe@empresa.com'],
      subject: 'Chamado #1 concluído',
    });

    expect(saida.to).toBe('teste@alletecnologia.com');
    // A cópia também é cortada: senão o e-mail chegaria a quem estava em cc.
    expect(saida.cc).toBeUndefined();
    // O destinatário real fica visível para conferência.
    expect(saida.subject).toContain('cliente@empresa.com');
    expect(saida.subject).toContain('chefe@empresa.com');
    expect(saida.subject).toContain('Chamado #1 concluído');
  });
});
