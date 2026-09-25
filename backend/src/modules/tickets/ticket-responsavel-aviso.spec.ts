import { deveAvisarNovoResponsavel } from './ticket-responsavel-aviso';
import { EmailTemplatesService } from '../mail/email-templates.service';
import { extractTicketNumberFromText } from '../email-inbound/email-inbound-ingest.service';

describe('deveAvisarNovoResponsavel', () => {
  const base = {
    ligado: true,
    atribuindo: true,
    emailNovoResponsavel: 'bruno@alletecnologia.com.br',
    emailAtor: 'ana@alletecnologia.com.br',
  };

  it('avisa quando outra pessoa coloca alguém como responsável', () => {
    expect(deveAvisarNovoResponsavel(base)).toBe(true);
  });

  it('não avisa quem se coloca como responsável', () => {
    expect(
      deveAvisarNovoResponsavel({
        ...base,
        emailAtor: 'bruno@alletecnologia.com.br',
      }),
    ).toBe(false);
  });

  it('reconhece a própria pessoa mesmo com caixa e espaço diferentes', () => {
    // O e-mail do login e o do cadastro nem sempre vêm iguais; se isso
    // escapasse, o "puxar para mim" mandaria aviso para a própria pessoa.
    expect(
      deveAvisarNovoResponsavel({
        ...base,
        emailAtor: '  Bruno@AlleTecnologia.com.br ',
      }),
    ).toBe(false);
  });

  it('fica calado quando não foi a tela que pediu (automação)', () => {
    expect(deveAvisarNovoResponsavel({ ...base, ligado: false })).toBe(false);
    expect(deveAvisarNovoResponsavel({ ...base, ligado: undefined })).toBe(
      false,
    );
  });

  it('não avisa quando o responsável não mudou', () => {
    expect(deveAvisarNovoResponsavel({ ...base, atribuindo: false })).toBe(
      false,
    );
  });

  it('não avisa quando o novo responsável não tem e-mail', () => {
    expect(
      deveAvisarNovoResponsavel({ ...base, emailNovoResponsavel: null }),
    ).toBe(false);
    expect(
      deveAvisarNovoResponsavel({ ...base, emailNovoResponsavel: '   ' }),
    ).toBe(false);
  });
});

describe('e-mail de novo responsável', () => {
  function montar() {
    // O modelo padrão nasce no primeiro envio (ensureDefaults faz upsert);
    // o mock guarda o que foi criado e devolve na leitura.
    const modelos = new Map<string, Record<string, string>>();
    const prisma = {
      emailTemplate: {
        upsert: jest.fn(async ({ where, create }) => {
          if (!modelos.has(where.key)) modelos.set(where.key, create);
        }),
        findUnique: jest.fn(async ({ where }) => modelos.get(where.key)),
      },
    };
    const mail = { sendMail: jest.fn(async (_payload: unknown) => true) };
    const service = new EmailTemplatesService(prisma as never, mail as never);
    return { service, mail };
  }

  async function enviar() {
    const { service, mail } = montar();
    await service.sendTicketResponsibleAssigned({
      to: 'bruno@alletecnologia.com.br',
      replyTo: 'ana@alletecnologia.com.br',
      responsibleName: 'Bruno',
      actorName: 'Ana',
      ticketNumber: 81825,
      title: 'Ajuste no Protheus',
      clientName: 'Fluidra',
    });
    return mail.sendMail.mock.calls[0][0] as {
      to: string;
      replyTo?: string;
      subject: string;
      text: string;
      html: string;
    };
  }

  it('manda para o novo responsável com a resposta indo para quem atribuiu', async () => {
    const enviado = await enviar();
    expect(enviado.to).toBe('bruno@alletecnologia.com.br');
    // A resposta NÃO pode voltar para a caixa do suporte.
    expect(enviado.replyTo).toBe('ana@alletecnologia.com.br');
  });

  it('diz quem atribuiu e qual chamado', async () => {
    const enviado = await enviar();
    expect(enviado.text).toContain('Ana colocou você como responsável');
    expect(enviado.text).toContain('81825');
    expect(enviado.text).toContain('Ajuste no Protheus');
    expect(enviado.text).toContain('/tickets/81825');
  });

  it('o assunto não é lido pela caixa de entrada como resposta de chamado', async () => {
    const enviado = await enviar();
    // Se a caixa reconhecesse o número, um "ok, vou ver" do colega que
    // chegasse lá viraria comunicação no chamado. Testa contra o extrator de
    // verdade, não contra uma cópia do regex.
    expect(extractTicketNumberFromText(enviado.subject)).toBeNull();
    expect(extractTicketNumberFromText(`Re: ${enviado.subject}`)).toBeNull();
    expect(extractTicketNumberFromText(`RES: ${enviado.subject}`)).toBeNull();
  });
});
