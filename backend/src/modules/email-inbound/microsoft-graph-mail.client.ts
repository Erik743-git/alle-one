import { Injectable, Logger } from '@nestjs/common';
import type { MailAddress } from '../mail/mail-address.util';

type TokenCache = { accessToken: string; expiresAt: number };

export type GraphMailMessage = {
  id: string;
  internetMessageId?: string;
  conversationId?: string;
  subject?: string;
  bodyPreview?: string;
  body?: { contentType?: string; content?: string };
  from?: { emailAddress?: { name?: string; address?: string } };
  toRecipients?: Array<{ emailAddress?: { name?: string; address?: string } }>;
  ccRecipients?: Array<{ emailAddress?: { name?: string; address?: string } }>;
  receivedDateTime?: string;
  hasAttachments?: boolean;
  internetMessageHeaders?: Array<{ name?: string; value?: string }>;
};

export type GraphOutgoingAttachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
  cid?: string;
};

export type GraphOutgoingMail = {
  mailbox: string;
  fromName?: string | null;
  to: MailAddress[];
  cc?: MailAddress[];
  replyTo?: MailAddress[];
  subject: string;
  text: string;
  html?: string;
  attachments?: GraphOutgoingAttachment[];
};

/** Folga para o limite de 4 MB do corpo JSON, já que o base64 cresce ~33%. */
const GRAPH_INLINE_ATTACHMENTS_MAX_BYTES = 2_500_000;
/** A partir daqui o Graph só aceita o anexo por sessão de upload. */
const GRAPH_UPLOAD_SESSION_MIN_BYTES = 3_000_000;
/** Fatias da sessão de upload precisam ser múltiplas de 320 KiB. */
const GRAPH_UPLOAD_CHUNK_BYTES = 320 * 1024 * 10;
const GRAPH_SEND_MAX_ATTEMPTS = 3;

@Injectable()
export class MicrosoftGraphMailClient {
  private readonly logger = new Logger(MicrosoftGraphMailClient.name);
  private tokenCache: TokenCache | null = null;

  isConfigured(params?: {
    tenantId?: string | null;
    clientId?: string | null;
  }): boolean {
    const tenant =
      params?.tenantId?.trim() || process.env.GRAPH_TENANT_ID?.trim();
    const clientId =
      params?.clientId?.trim() || process.env.GRAPH_CLIENT_ID?.trim();
    const secret = process.env.GRAPH_CLIENT_SECRET?.trim();
    return Boolean(tenant && clientId && secret);
  }

  private async getAccessToken(params?: {
    tenantId?: string | null;
    clientId?: string | null;
  }): Promise<string> {
    const now = Date.now();
    if (this.tokenCache && this.tokenCache.expiresAt > now + 60_000) {
      return this.tokenCache.accessToken;
    }

    const tenant =
      params?.tenantId?.trim() || process.env.GRAPH_TENANT_ID?.trim();
    const clientId =
      params?.clientId?.trim() || process.env.GRAPH_CLIENT_ID?.trim();
    const secret = process.env.GRAPH_CLIENT_SECRET?.trim();
    if (!tenant || !clientId || !secret) {
      throw new Error(
        'Graph não configurado (GRAPH_TENANT_ID / GRAPH_CLIENT_ID / GRAPH_CLIENT_SECRET).',
      );
    }

    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: secret,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    });

    const res = await fetch(
      `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      },
    );
    if (!res.ok) {
      const text = await res.text();
      this.logger.warn(
        `Falha token Graph: ${res.status} ${text.slice(0, 200)}`,
      );
      throw new Error(`Falha ao obter token Microsoft Graph (${res.status}).`);
    }
    const json = (await res.json()) as {
      access_token: string;
      expires_in: number;
    };
    this.tokenCache = {
      accessToken: json.access_token,
      expiresAt: now + (json.expires_in ?? 3600) * 1000,
    };
    return json.access_token;
  }

  private async graphFetch(
    path: string,
    init?: RequestInit,
    auth?: { tenantId?: string | null; clientId?: string | null },
  ): Promise<Response> {
    const token = await this.getAccessToken(auth);
    return fetch(`https://graph.microsoft.com/v1.0${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init?.headers ?? {}),
      },
    });
  }

  async listRecentMessages(params: {
    mailbox: string;
    top?: number;
    tenantId?: string | null;
    clientId?: string | null;
  }): Promise<GraphMailMessage[]> {
    const top = params.top ?? 25;
    const mailbox = encodeURIComponent(params.mailbox);
    const select =
      'id,internetMessageId,conversationId,subject,bodyPreview,body,from,toRecipients,ccRecipients,receivedDateTime,hasAttachments,internetMessageHeaders';
    const res = await this.graphFetch(
      `/users/${mailbox}/mailFolders/inbox/messages?$top=${top}&$orderby=receivedDateTime desc&$select=${select}`,
      undefined,
      params,
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `Graph list messages ${res.status}: ${text.slice(0, 300)}`,
      );
    }
    const json = (await res.json()) as { value?: GraphMailMessage[] };
    return json.value ?? [];
  }

  async getMessage(params: {
    mailbox: string;
    graphMessageId: string;
    tenantId?: string | null;
    clientId?: string | null;
  }): Promise<GraphMailMessage> {
    const mailbox = encodeURIComponent(params.mailbox);
    const id = encodeURIComponent(params.graphMessageId);
    const select =
      'id,internetMessageId,conversationId,subject,bodyPreview,body,from,toRecipients,ccRecipients,receivedDateTime,hasAttachments,internetMessageHeaders';
    const res = await this.graphFetch(
      `/users/${mailbox}/messages/${id}?$select=${select}`,
      undefined,
      params,
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Graph get message ${res.status}: ${text.slice(0, 300)}`);
    }
    return (await res.json()) as GraphMailMessage;
  }

  async listAttachmentsMeta(params: {
    mailbox: string;
    graphMessageId: string;
    tenantId?: string | null;
    clientId?: string | null;
  }): Promise<
    Array<{
      id: string;
      name: string;
      contentType?: string;
      size?: number;
      contentId?: string | null;
      isInline?: boolean;
    }>
  > {
    const mailbox = encodeURIComponent(params.mailbox);
    const id = encodeURIComponent(params.graphMessageId);
    const pathWithCid = `/users/${mailbox}/messages/${id}/attachments?$select=id,name,contentType,size,contentId,isInline`;
    let res = await this.graphFetch(pathWithCid, undefined, params);
    if (!res.ok) {
      // Fallback: alguns tenants rejeitam contentId no $select.
      res = await this.graphFetch(
        `/users/${mailbox}/messages/${id}/attachments?$select=id,name,contentType,size`,
        undefined,
        params,
      );
    }
    if (!res.ok) return [];
    const json = (await res.json()) as {
      value?: Array<{
        id: string;
        name: string;
        contentType?: string;
        size?: number;
        contentId?: string | null;
        isInline?: boolean;
        '@odata.type'?: string;
      }>;
    };
    return (json.value ?? []).filter(
      (a) =>
        a['@odata.type'] === '#microsoft.graph.fileAttachment' ||
        !a['@odata.type'],
    );
  }

  async downloadAttachment(params: {
    mailbox: string;
    graphMessageId: string;
    attachmentId: string;
    tenantId?: string | null;
    clientId?: string | null;
  }): Promise<{
    name: string;
    contentType?: string;
    contentBytes: Buffer;
    contentId?: string | null;
    isInline?: boolean;
  }> {
    const mailbox = encodeURIComponent(params.mailbox);
    const mid = encodeURIComponent(params.graphMessageId);
    const aid = encodeURIComponent(params.attachmentId);
    const res = await this.graphFetch(
      `/users/${mailbox}/messages/${mid}/attachments/${aid}`,
      undefined,
      params,
    );
    if (!res.ok) {
      throw new Error(`Graph attachment ${res.status}`);
    }
    const json = (await res.json()) as {
      name: string;
      contentType?: string;
      contentBytes?: string;
      contentId?: string | null;
      isInline?: boolean;
    };
    return {
      name: json.name,
      contentType: json.contentType,
      contentBytes: Buffer.from(json.contentBytes ?? '', 'base64'),
      contentId: json.contentId ?? null,
      isInline: json.isInline,
    };
  }

  /**
   * Envia pela própria caixa (`/users/{mailbox}`), com credencial de
   * aplicativo — não depende de senha nem de MFA da conta.
   *
   * O corpo JSON do Graph aceita no máximo 4 MB já com o base64 dos anexos.
   * Acima disso a mensagem vira rascunho, os anexos sobem um a um (os grandes
   * por sessão de upload) e só então o rascunho é enviado.
   *
   * Rascunho exige Mail.ReadWrite; só com Mail.Send o Graph responde 403.
   * Nesse caso o e-mail sai mesmo assim, sem os anexos que não cabem no
   * envio direto e com um aviso no corpo — aviso sem anexo é melhor que
   * aviso nenhum.
   */
  async sendMail(
    mail: GraphOutgoingMail,
    auth?: { tenantId?: string | null; clientId?: string | null },
  ): Promise<void> {
    const attachments = mail.attachments ?? [];
    const total = attachments.reduce((sum, a) => sum + a.content.length, 0);
    const mailbox = encodeURIComponent(mail.mailbox);
    const message = this.buildOutgoingMessage(mail);

    if (total <= GRAPH_INLINE_ATTACHMENTS_MAX_BYTES) {
      await this.sendDirect(mailbox, message, attachments, auth);
      return;
    }

    const draftRes = await this.graphSend(
      `/users/${mailbox}/messages`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
      },
      auth,
    );
    if (draftRes.status === 403) {
      await draftRes.text().catch(() => undefined);
      await this.sendWithoutOversizedAttachments(mail, auth);
      return;
    }
    await assertGraphOk(draftRes, 'rascunho');
    const draft = (await draftRes.json()) as { id: string };
    const messagePath = `/users/${mailbox}/messages/${encodeURIComponent(draft.id)}`;

    try {
      for (const attachment of attachments) {
        if (attachment.content.length < GRAPH_UPLOAD_SESSION_MIN_BYTES) {
          const res = await this.graphSend(
            `${messagePath}/attachments`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(toGraphFileAttachment(attachment)),
            },
            auth,
          );
          await assertGraphOk(res, `anexo ${attachment.filename}`);
        } else {
          await this.uploadLargeAttachment(messagePath, attachment, auth);
        }
      }
      const sent = await this.graphSend(
        `${messagePath}/send`,
        { method: 'POST' },
        auth,
      );
      await assertGraphOk(sent, 'envio do rascunho');
    } catch (err) {
      // Sem isso o rascunho fica esquecido na pasta Rascunhos da caixa.
      await this.graphSend(messagePath, { method: 'DELETE' }, auth).catch(
        () => undefined,
      );
      throw err;
    }
  }

  private async sendDirect(
    mailbox: string,
    message: ReturnType<MicrosoftGraphMailClient['buildOutgoingMessage']>,
    attachments: GraphOutgoingAttachment[],
    auth?: { tenantId?: string | null; clientId?: string | null },
  ) {
    const res = await this.graphSend(
      `/users/${mailbox}/sendMail`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            ...message,
            attachments: attachments.map(toGraphFileAttachment),
          },
          saveToSentItems: true,
        }),
      },
      auth,
    );
    await assertGraphOk(res, 'envio');
  }

  /**
   * Plano B quando não dá para criar rascunho: imagens do corpo (cid) vêm
   * primeiro, porque sem elas o texto fica quebrado; depois os anexos, na
   * ordem, enquanto couberem no envio direto.
   */
  private async sendWithoutOversizedAttachments(
    mail: GraphOutgoingMail,
    auth?: { tenantId?: string | null; clientId?: string | null },
  ) {
    const all = mail.attachments ?? [];
    const ordered = [...all.filter((a) => a.cid), ...all.filter((a) => !a.cid)];
    const kept: GraphOutgoingAttachment[] = [];
    const dropped: GraphOutgoingAttachment[] = [];
    let size = 0;
    for (const attachment of ordered) {
      if (
        size + attachment.content.length <=
        GRAPH_INLINE_ATTACHMENTS_MAX_BYTES
      ) {
        kept.push(attachment);
        size += attachment.content.length;
      } else {
        dropped.push(attachment);
      }
    }

    const names = dropped.map((a) => a.filename).join(', ');
    const note = `Alguns anexos não couberam neste e-mail e estão disponíveis no chamado, no portal: ${names}.`;
    const withNote: GraphOutgoingMail = {
      ...mail,
      text: `${mail.text}\n\n${note}`,
      html: mail.html
        ? `${mail.html}<p><em>${escapeHtml(note)}</em></p>`
        : undefined,
    };
    this.logger.warn(
      `Graph sem permissão de rascunho (Mail.ReadWrite): "${mail.subject}" enviado sem ${dropped.length} anexo(s): ${names}`,
    );
    await this.sendDirect(
      encodeURIComponent(mail.mailbox),
      this.buildOutgoingMessage(withNote),
      kept,
      auth,
    );
  }

  private buildOutgoingMessage(mail: GraphOutgoingMail) {
    const recipient = (r: MailAddress) => ({
      emailAddress: r.name
        ? { name: r.name, address: r.address }
        : { address: r.address },
    });
    return {
      subject: mail.subject,
      body: mail.html
        ? { contentType: 'HTML', content: mail.html }
        : { contentType: 'Text', content: mail.text },
      toRecipients: mail.to.map(recipient),
      ccRecipients: (mail.cc ?? []).map(recipient),
      replyTo: (mail.replyTo ?? []).map(recipient),
      ...(mail.fromName
        ? {
            from: {
              emailAddress: { name: mail.fromName, address: mail.mailbox },
            },
          }
        : {}),
    };
  }

  private async uploadLargeAttachment(
    messagePath: string,
    attachment: GraphOutgoingAttachment,
    auth?: { tenantId?: string | null; clientId?: string | null },
  ) {
    const size = attachment.content.length;
    const res = await this.graphSend(
      `${messagePath}/attachments/createUploadSession`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          AttachmentItem: {
            attachmentType: 'file',
            name: attachment.filename,
            size,
            contentType: attachment.contentType ?? 'application/octet-stream',
            ...(attachment.cid
              ? { isInline: true, contentId: attachment.cid }
              : {}),
          },
        }),
      },
      auth,
    );
    await assertGraphOk(res, `sessão de upload de ${attachment.filename}`);
    const { uploadUrl } = (await res.json()) as { uploadUrl: string };

    for (let start = 0; start < size; start += GRAPH_UPLOAD_CHUNK_BYTES) {
      const end = Math.min(start + GRAPH_UPLOAD_CHUNK_BYTES, size);
      // A URL da sessão já vem autenticada: mandar Authorization aqui dá 401.
      const put = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Range': `bytes ${start}-${end - 1}/${size}`,
        },
        body: new Uint8Array(attachment.content.subarray(start, end)),
      });
      await assertGraphOk(put, `upload de ${attachment.filename}`);
    }
  }

  /** graphFetch com nova tentativa quando o Graph pede para esperar. */
  private async graphSend(
    path: string,
    init: RequestInit,
    auth?: { tenantId?: string | null; clientId?: string | null },
  ): Promise<Response> {
    for (let attempt = 1; ; attempt++) {
      const res = await this.graphFetch(path, init, auth);
      const retryable =
        res.status === 429 || res.status === 503 || res.status === 504;
      if (!retryable || attempt >= GRAPH_SEND_MAX_ATTEMPTS) return res;
      const retryAfter = Number(res.headers.get('retry-after'));
      const waitMs =
        Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(retryAfter, 30) * 1000
          : 2000 * attempt;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
}

async function assertGraphOk(res: Response, etapa: string) {
  if (res.ok) return;
  const text = await res.text().catch(() => '');
  let detail = text.slice(0, 300);
  try {
    const parsed = JSON.parse(text) as {
      error?: { code?: string; message?: string };
    };
    if (parsed.error?.message) {
      detail = `${parsed.error.code ?? ''} ${parsed.error.message}`.trim();
    }
  } catch {
    // resposta não-JSON: fica o texto cru
  }
  const dica =
    res.status === 403
      ? ' (o aplicativo tem a permissão Mail.Send com consentimento de administrador?)'
      : '';
  throw new Error(
    `Microsoft Graph ${res.status} no ${etapa}: ${detail}${dica}`,
  );
}

function toGraphFileAttachment(attachment: GraphOutgoingAttachment) {
  return {
    '@odata.type': '#microsoft.graph.fileAttachment',
    name: attachment.filename,
    contentType: attachment.contentType ?? 'application/octet-stream',
    contentBytes: attachment.content.toString('base64'),
    ...(attachment.cid ? { isInline: true, contentId: attachment.cid } : {}),
  };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
