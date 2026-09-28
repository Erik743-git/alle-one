import { Logger } from '@nestjs/common';
import { MailboxNotificationKind, Prisma } from '@prisma/client';
import {
  avisarNoCorreio,
  deveAvisarSolicitante,
  textoChamadoAberto,
  textoNovoResponsavel,
} from './ticket-correio';

describe('textos do Correio (os combinados com o Erik)', () => {
  it('chamado aberto para o solicitante', () => {
    expect(textoChamadoAberto(123, 'Servidor fora', 'Ana')).toBe(
      'Chamado #123 aberto para você: Servidor fora. Aberto por Ana.',
    );
  });

  it('novo responsável', () => {
    expect(textoNovoResponsavel(123, 'Servidor fora', 'Ana')).toBe(
      'Você agora é o responsável pelo chamado #123: Servidor fora. Atribuído por Ana.',
    );
  });

  it('título que já termina em ponto não vira ".."', () => {
    expect(textoChamadoAberto(1, 'Reset de senhas.', 'Breno')).toBe(
      'Chamado #1 aberto para você: Reset de senhas. Aberto por Breno.',
    );
  });

  it('chamado sem título ainda forma a frase', () => {
    expect(textoNovoResponsavel(1, null, 'Breno')).toContain(': sem título.');
  });
});

describe('quando avisar o solicitante', () => {
  const base = {
    ligado: true,
    emailSolicitante: 'cliente@empresa.com.br',
    emailAtor: 'ana@alletecnologia.com.br',
  };

  it('outra pessoa abriu para ele: avisa', () => {
    expect(deveAvisarSolicitante(base)).toBe(true);
  });

  it('ele mesmo abriu: não avisa', () => {
    expect(
      deveAvisarSolicitante({
        ...base,
        emailAtor: ' Cliente@Empresa.com.br ',
      }),
    ).toBe(false);
  });

  it('rotina (a opção não vem ligada): não avisa', () => {
    expect(deveAvisarSolicitante({ ...base, ligado: undefined })).toBe(false);
  });

  it('sem e-mail de solicitante: não avisa', () => {
    expect(deveAvisarSolicitante({ ...base, emailSolicitante: '' })).toBe(
      false,
    );
  });
});

describe('gravar no Correio', () => {
  const logger = { warn: jest.fn() } as unknown as Logger;
  const params = {
    email: 'cliente@empresa.com.br',
    kind: MailboxNotificationKind.TICKET_ABERTO_PARA_VOCE,
    texto: 'Chamado #123 aberto para você: X. Aberto por Ana.',
    ticketNumber: 123,
    dedupeKey: 'ticket-aberto:123',
  };

  function prismaCom(usuario: { id: string } | null, criar?: jest.Mock) {
    return {
      user: { findFirst: jest.fn(async () => usuario) },
      mailboxNotification: {
        create: criar ?? jest.fn(async (_args: unknown) => ({})),
      },
    };
  }

  it('grava para quem tem login, com a frase no título e o link do chamado', async () => {
    const prisma = prismaCom({ id: 'u1' });
    expect(await avisarNoCorreio(prisma as never, logger, params)).toBe(true);
    expect(prisma.mailboxNotification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'u1',
        kind: MailboxNotificationKind.TICKET_ABERTO_PARA_VOCE,
        title: params.texto,
        href: '/tickets/123',
        dedupeKey: 'ticket-aberto:123',
      }),
    });
  });

  it('e-mail sem login no portal: não grava nada', async () => {
    const prisma = prismaCom(null);
    expect(await avisarNoCorreio(prisma as never, logger, params)).toBe(false);
    expect(prisma.mailboxNotification.create).not.toHaveBeenCalled();
  });

  it('aviso repetido (mesma chave) não é erro', async () => {
    const duplicado = new Prisma.PrismaClientKnownRequestError('dup', {
      code: 'P2002',
      clientVersion: 'x',
    });
    const prisma = prismaCom(
      { id: 'u1' },
      jest.fn(async () => {
        throw duplicado;
      }),
    );
    await expect(
      avisarNoCorreio(prisma as never, logger, params),
    ).resolves.toBe(false);
  });

  it('erro de banco vira log e nunca derruba quem chamou', async () => {
    const prisma = prismaCom(
      { id: 'u1' },
      jest.fn(async () => {
        throw new Error('fora do ar');
      }),
    );
    await expect(
      avisarNoCorreio(prisma as never, logger, params),
    ).resolves.toBe(false);
    expect(logger.warn).toHaveBeenCalled();
  });
});
