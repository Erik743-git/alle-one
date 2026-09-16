import { MicrosoftGraphMailClient } from './microsoft-graph-mail.client';

type Call = { url: string; init: RequestInit };

function json(status: number, body: unknown, headers?: Record<string, string>) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...(headers ?? {}) },
  });
}

describe('MicrosoftGraphMailClient.sendMail', () => {
  const originalFetch = global.fetch;
  let calls: Call[];
  let responder: (call: Call) => Response;

  beforeEach(() => {
    process.env.GRAPH_CLIENT_SECRET = 'segredo';
    calls = [];
    global.fetch = jest.fn((url: string | URL, init?: RequestInit) => {
      const call = { url: String(url), init: init ?? {} };
      calls.push(call);
      if (call.url.includes('login.microsoftonline.com')) {
        return Promise.resolve(
          json(200, { access_token: 'tk', expires_in: 3600 }),
        );
      }
      return Promise.resolve(responder(call));
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.GRAPH_CLIENT_SECRET;
    jest.useRealTimers();
  });

  const auth = { tenantId: 'tenant', clientId: 'app' };
  const graphCalls = () =>
    calls.filter((c) => c.url.startsWith('https://graph.microsoft.com'));

  it('mensagem pequena vai num único sendMail, com anexo inline por cid', async () => {
    responder = () => json(202, undefined);
    const client = new MicrosoftGraphMailClient();

    await client.sendMail(
      {
        mailbox: 'suporte@alle.com',
        fromName: 'Alle One',
        to: [{ address: 'cli@x.com', name: 'Cliente' }],
        cc: [{ address: 'cc@x.com' }],
        subject: 'Chamado #1',
        text: 'texto',
        html: '<p>oi</p><img src="cid:logo">',
        attachments: [
          {
            filename: 'logo.png',
            content: Buffer.from('png'),
            contentType: 'image/png',
            cid: 'logo',
          },
        ],
      },
      auth,
    );

    const [send] = graphCalls();
    expect(graphCalls()).toHaveLength(1);
    expect(send.url).toBe(
      'https://graph.microsoft.com/v1.0/users/suporte%40alle.com/sendMail',
    );
    expect((send.init.headers as Record<string, string>).Authorization).toBe(
      'Bearer tk',
    );
    const body = JSON.parse(send.init.body as string);
    expect(body.saveToSentItems).toBe(true);
    expect(body.message.body).toEqual({
      contentType: 'HTML',
      content: '<p>oi</p><img src="cid:logo">',
    });
    expect(body.message.from.emailAddress).toEqual({
      name: 'Alle One',
      address: 'suporte@alle.com',
    });
    expect(body.message.toRecipients).toEqual([
      { emailAddress: { name: 'Cliente', address: 'cli@x.com' } },
    ]);
    expect(body.message.ccRecipients).toEqual([
      { emailAddress: { address: 'cc@x.com' } },
    ]);
    expect(body.message.attachments).toEqual([
      {
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: 'logo.png',
        contentType: 'image/png',
        contentBytes: Buffer.from('png').toString('base64'),
        isInline: true,
        contentId: 'logo',
      },
    ]);
  });

  it('anexo grande: rascunho, sessão de upload fatiada sem Authorization, envio', async () => {
    const big = Buffer.alloc(3_500_000, 7);
    const small = Buffer.alloc(10, 1);
    responder = (call) => {
      if (call.url.endsWith('/users/suporte%40alle.com/messages')) {
        return json(201, { id: 'rasc/1' });
      }
      if (call.url.endsWith('/createUploadSession')) {
        return json(201, { uploadUrl: 'https://upload.example/sessao' });
      }
      if (call.url.endsWith('/attachments')) return json(201, { id: 'a' });
      if (call.url.endsWith('/send')) return json(202, undefined);
      throw new Error(`chamada inesperada ${call.url}`);
    };
    global.fetch = ((orig) =>
      jest.fn((url: string | URL, init?: RequestInit) => {
        if (String(url).startsWith('https://upload.example')) {
          calls.push({ url: String(url), init: init ?? {} });
          return Promise.resolve(json(200, {}));
        }
        return orig(url, init);
      }))(global.fetch) as unknown as typeof fetch;

    await new MicrosoftGraphMailClient().sendMail(
      {
        mailbox: 'suporte@alle.com',
        to: [{ address: 'cli@x.com' }],
        subject: 'Relatório',
        text: 'segue',
        attachments: [
          { filename: 'pequeno.txt', content: small },
          {
            filename: 'grande.pdf',
            content: big,
            contentType: 'application/pdf',
          },
        ],
      },
      auth,
    );

    const base = 'https://graph.microsoft.com/v1.0/users/suporte%40alle.com';
    const draftPath = `${base}/messages/rasc%2F1`;
    expect(graphCalls().map((c) => c.url)).toEqual([
      `${base}/messages`,
      `${draftPath}/attachments`,
      `${draftPath}/attachments/createUploadSession`,
      `${draftPath}/send`,
    ]);

    const session = JSON.parse(graphCalls()[2].init.body as string);
    expect(session.AttachmentItem).toEqual({
      attachmentType: 'file',
      name: 'grande.pdf',
      size: big.length,
      contentType: 'application/pdf',
    });

    const puts = calls.filter((c) =>
      c.url.startsWith('https://upload.example'),
    );
    const chunk = 320 * 1024 * 10;
    expect(
      puts.map(
        (p) => (p.init.headers as Record<string, string>)['Content-Range'],
      ),
    ).toEqual([
      `bytes 0-${chunk - 1}/${big.length}`,
      `bytes ${chunk}-${big.length - 1}/${big.length}`,
    ]);
    for (const put of puts) {
      expect(
        (put.init.headers as Record<string, string>).Authorization,
      ).toBeUndefined();
    }
    const enviados = puts.reduce(
      (sum, p) => sum + (p.init.body as Uint8Array).length,
      0,
    );
    expect(enviados).toBe(big.length);
  });

  it('se o envio do rascunho falhar, apaga o rascunho e propaga o erro', async () => {
    responder = (call) => {
      if (call.init.method === 'DELETE') return json(204, undefined);
      if (call.url.endsWith('/messages')) return json(201, { id: 'r2' });
      if (call.url.endsWith('/attachments')) return json(201, { id: 'a' });
      if (call.url.endsWith('/send')) {
        return json(403, {
          error: { code: 'ErrorAccessDenied', message: 'Access is denied.' },
        });
      }
      throw new Error(`chamada inesperada ${call.url}`);
    };

    await expect(
      new MicrosoftGraphMailClient().sendMail(
        {
          mailbox: 'suporte@alle.com',
          to: [{ address: 'cli@x.com' }],
          subject: 's',
          text: 't',
          attachments: [
            { filename: 'a.bin', content: Buffer.alloc(1_300_000) },
            { filename: 'b.bin', content: Buffer.alloc(1_300_000) },
          ],
        },
        auth,
      ),
    ).rejects.toThrow(
      /Microsoft Graph 403 no envio do rascunho: ErrorAccessDenied Access is denied\. \(o aplicativo tem a permissão Mail\.Send/,
    );

    const ultima = graphCalls().at(-1)!;
    expect(ultima.init.method).toBe('DELETE');
    expect(ultima.url).toBe(
      'https://graph.microsoft.com/v1.0/users/suporte%40alle.com/messages/r2',
    );
  });

  it('respeita Retry-After em 429 e tenta de novo', async () => {
    jest.useFakeTimers();
    let tentativas = 0;
    responder = () => {
      tentativas += 1;
      return tentativas === 1
        ? json(429, { error: { message: 'devagar' } }, { 'Retry-After': '1' })
        : json(202, undefined);
    };

    const envio = new MicrosoftGraphMailClient().sendMail(
      {
        mailbox: 'suporte@alle.com',
        to: [{ address: 'cli@x.com' }],
        subject: 's',
        text: 't',
      },
      auth,
    );
    await jest.advanceTimersByTimeAsync(1000);
    await envio;

    expect(tentativas).toBe(2);
  });
});
