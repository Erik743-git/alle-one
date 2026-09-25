import {
  OportunidadesEmailService,
  anexosAproveitaveis,
  tituloDoAssunto,
} from './oportunidades-email.service';

const LIGADA_EM = new Date('2026-09-25T12:00:00Z');
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const PDF = Buffer.from('%PDF-1.4\n%fake\n');

type Msg = Record<string, unknown>;

function montar(
  mensagens: Msg[],
  anexosPorMsg: Record<string, Array<Record<string, unknown>>> = {},
) {
  const cards: Array<Record<string, unknown>> = [];
  const eventos: Array<Record<string, unknown>> = [];
  const prisma = {
    oportunidadeConfig: {
      findUnique: jest.fn().mockResolvedValue({
        leituraAtiva: true,
        caixaEmail: 'oportunidades@alle.test',
        leituraDesde: LIGADA_EM,
      }),
      update: jest.fn().mockResolvedValue({}),
    },
    emailInboundSettings: { findUnique: jest.fn().mockResolvedValue(null) },
    oportunidade: {
      findUnique: jest.fn(({ where }) =>
        Promise.resolve(
          cards.find((c) => c.emailMessageId === where.emailMessageId) ?? null,
        ),
      ),
      findFirst: jest.fn(({ where }) =>
        Promise.resolve(
          cards.find(
            (c) =>
              (where.emailConversationId &&
                c.emailConversationId === where.emailConversationId) ||
              (where.numero && c.numero === where.numero),
          ) ?? null,
        ),
      ),
      create: jest.fn(({ data }) => {
        const card = {
          id: `c${cards.length + 1}`,
          numero: cards.length + 1,
          ...data,
        };
        cards.push(card);
        return Promise.resolve(card);
      }),
      update: jest.fn().mockResolvedValue({}),
    },
    oportunidadeEvento: {
      findFirst: jest.fn(({ where }) =>
        Promise.resolve(
          eventos.find((e) => e.tipo === where.tipo && e.para === where.para) ??
            null,
        ),
      ),
      create: jest.fn(({ data }) => {
        eventos.push(data);
        return Promise.resolve(data);
      }),
    },
    user: {
      findFirst: jest.fn(({ where }) => {
        if (where.role === 'ADMIN') return Promise.resolve({ id: 'admin' });
        if (where.email?.equals === 'carla@cliente.test') {
          return Promise.resolve({
            id: 'u-carla',
            name: 'Carla',
            email: 'carla@cliente.test',
            role: 'CLIENT_GESTOR',
            companyId: 'emp1',
          });
        }
        return Promise.resolve(null);
      }),
    },
  };
  const graph = {
    isConfigured: jest.fn().mockReturnValue(true),
    listRecentMessages: jest.fn().mockResolvedValue(mensagens),
    listAttachmentsMeta: jest.fn(({ graphMessageId }) =>
      Promise.resolve(anexosPorMsg[graphMessageId] ?? []),
    ),
    downloadAttachment: jest.fn(({ attachmentId }) =>
      Promise.resolve({
        name: attachmentId === 'a-pdf' ? 'proposta.pdf' : 'foto.png',
        contentType: attachmentId === 'a-pdf' ? 'application/pdf' : 'image/png',
        contentBytes: attachmentId === 'a-pdf' ? PDF : PNG,
      }),
    ),
  };
  const oportunidades = {
    guardarArquivo: jest.fn().mockResolvedValue(undefined),
    obterParaAviso: jest.fn().mockResolvedValue({ id: 'x' }),
    avisarComercialNova: jest.fn().mockResolvedValue(undefined),
  };
  const svc = new OportunidadesEmailService(
    prisma as never,
    graph as never,
    oportunidades as never,
  );
  return { svc, cards, eventos, graph, oportunidades };
}

const msg = (over: Msg): Msg => ({
  id: 'g1',
  internetMessageId: '<m1@cliente.test>',
  conversationId: 'conv-1',
  subject: 'Orçamento de 10 notebooks',
  body: {
    contentType: 'html',
    content: '<p>Bom dia, <b>preciso</b> de 10 notebooks.</p>',
  },
  from: { emailAddress: { name: 'Carla', address: 'carla@cliente.test' } },
  receivedDateTime: '2026-09-25T13:00:00Z',
  hasAttachments: false,
  internetMessageHeaders: [],
  ...over,
});

describe('regras do leitor de e-mail', () => {
  it('título sem RE:/ENC:/FW: repetidos', () => {
    expect(tituloDoAssunto('RE: ENC: Fw: Orçamento')).toBe('Orçamento');
    expect(tituloDoAssunto('')).toBe('(sem assunto)');
  });

  it('descarta imagem colada no corpo, conteúdo ativo e arquivo grande', () => {
    const corpo = '<img src="cid:logo123">';
    const r = anexosAproveitaveis(
      [
        {
          name: 'logo.png',
          contentType: 'image/png',
          contentId: '<logo123>',
          isInline: false,
        },
        { name: 'assinatura.jpg', contentType: 'image/jpeg', isInline: true },
        { name: 'pagina.html', contentType: 'text/html' },
        {
          name: 'enorme.pdf',
          contentType: 'application/pdf',
          size: 50 * 1024 * 1024,
        },
        { name: 'proposta.pdf', contentType: 'application/pdf', size: 1000 },
      ],
      corpo,
    );
    expect(r.map((a) => a.name)).toEqual(['proposta.pdf']);
  });
});

describe('OportunidadesEmailService.lerCaixa', () => {
  it('e-mail novo vira card em Pendente, com cliente do remetente e texto sem HTML', async () => {
    const { svc, cards, oportunidades } = montar([msg({})]);
    const r = await svc.lerCaixa();
    expect(r.criados).toBe(1);
    expect(cards[0]).toMatchObject({
      titulo: 'Orçamento de 10 notebooks',
      origem: 'EMAIL',
      solicitanteUserId: 'u-carla',
      solicitanteEmail: 'carla@cliente.test',
      companyId: 'emp1',
    });
    expect(cards[0].descricao).toBe('Bom dia, preciso de 10 notebooks.');
    expect(oportunidades.avisarComercialNova).toHaveBeenCalledTimes(1);
  });

  it('não lê o mesmo e-mail duas vezes', async () => {
    const { svc, cards } = montar([msg({})]);
    await svc.lerCaixa();
    await svc.lerCaixa();
    expect(cards).toHaveLength(1);
  });

  it('e-mail de antes da leitura ser ligada e aviso do próprio portal são ignorados', async () => {
    const { svc, cards } = montar([
      msg({
        id: 'g-velho',
        internetMessageId: '<velho>',
        receivedDateTime: '2026-09-25T11:00:00Z',
      }),
      msg({
        id: 'g-portal',
        internetMessageId: '<portal>',
        conversationId: 'conv-p',
        internetMessageHeaders: [{ name: 'x-alleone-portal', value: '1' }],
      }),
    ]);
    await svc.lerCaixa();
    expect(cards).toHaveLength(0);
  });

  it('resposta na mesma conversa não cria card: só os anexos entram, sem a imagem do corpo', async () => {
    const original = msg({});
    const resposta = msg({
      id: 'g2',
      internetMessageId: '<m2@cliente.test>',
      subject: 'RE: Orçamento de 10 notebooks',
      receivedDateTime: '2026-09-25T14:00:00Z',
      hasAttachments: true,
      body: {
        contentType: 'html',
        content: '<p>Segue.</p><img src="cid:assin">',
      },
    });
    // A caixa lista a mais nova primeiro.
    const { svc, cards, oportunidades } = montar([resposta, original], {
      g2: [
        {
          id: 'a-pdf',
          name: 'proposta.pdf',
          contentType: 'application/pdf',
          size: 20,
        },
        {
          id: 'a-img',
          name: 'assinatura.png',
          contentType: 'image/png',
          contentId: 'assin',
          size: 20,
        },
      ],
    });
    const r = await svc.lerCaixa();
    expect(r).toMatchObject({ criados: 1, respostas: 1 });
    expect(cards).toHaveLength(1);
    expect(oportunidades.guardarArquivo).toHaveBeenCalledTimes(1);
    expect(oportunidades.guardarArquivo.mock.calls[0][2]).toBe('proposta.pdf');
  });

  it('resposta citando "Oportunidade #N" no assunto cai no card certo', async () => {
    const original = msg({});
    const aviso = msg({
      id: 'g3',
      internetMessageId: '<m3@cliente.test>',
      conversationId: 'outra-conversa',
      subject: 'RE: Oportunidade #1 mudou para "Em análise" — Orçamento',
      receivedDateTime: '2026-09-25T15:00:00Z',
    });
    const { svc, cards, eventos } = montar([aviso, original]);
    const r = await svc.lerCaixa();
    expect(r).toMatchObject({ criados: 1, respostas: 1 });
    expect(cards).toHaveLength(1);
    expect(
      eventos.some(
        (e) => e.tipo === 'EMAIL_RESPOSTA' && e.oportunidadeId === 'c1',
      ),
    ).toBe(true);
  });
});
