import { Injectable, Logger } from '@nestjs/common';

type TokenCache = { accessToken: string; expiresAt: number };

export type GraphMailMessage = {
  id: string;
  internetMessageId?: string;
  subject?: string;
  bodyPreview?: string;
  body?: { contentType?: string; content?: string };
  from?: { emailAddress?: { name?: string; address?: string } };
  toRecipients?: Array<{ emailAddress?: { name?: string; address?: string } }>;
  ccRecipients?: Array<{ emailAddress?: { name?: string; address?: string } }>;
  receivedDateTime?: string;
  hasAttachments?: boolean;
};

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
      this.logger.warn(`Falha token Graph: ${res.status} ${text.slice(0, 200)}`);
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
      'id,internetMessageId,subject,bodyPreview,body,from,toRecipients,ccRecipients,receivedDateTime,hasAttachments';
    const res = await this.graphFetch(
      `/users/${mailbox}/mailFolders/inbox/messages?$top=${top}&$orderby=receivedDateTime desc&$select=${select}`,
      undefined,
      params,
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Graph list messages ${res.status}: ${text.slice(0, 300)}`);
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
      'id,internetMessageId,subject,bodyPreview,body,from,toRecipients,ccRecipients,receivedDateTime,hasAttachments';
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
}
