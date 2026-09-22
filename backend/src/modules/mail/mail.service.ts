import { Injectable, Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { PrismaService } from '../../prisma/prisma.service';
import { MicrosoftGraphMailClient } from '../email-inbound/microsoft-graph-mail.client';
import { parseMailAddress, parseMailAddressList } from './mail-address.util';

export type SendMailAttachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
  cid?: string;
};

type SendMailPayload = {
  to: string[] | string;
  cc?: string[] | string;
  replyTo?: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: SendMailAttachment[];
};

function envTrim(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const t = value.trim();
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    return t.slice(1, -1).trim();
  }
  return t;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transport: nodemailer.Transporter | null = null;
  private transportState: 'unknown' | 'disabled' | 'ready' = 'unknown';

  constructor(
    private readonly prisma: PrismaService,
    private readonly graph: MicrosoftGraphMailClient,
  ) {}

  private buildTransport() {
    const host = envTrim(process.env.SMTP_HOST);
    const portRaw = envTrim(process.env.SMTP_PORT);
    const user = envTrim(process.env.SMTP_USER);
    const pass = envTrim(process.env.SMTP_PASS);

    const clientId = envTrim(process.env.GOOGLE_CLIENT_ID);
    const clientSecret = envTrim(process.env.GOOGLE_CLIENT_SECRET);
    const refreshToken = envTrim(process.env.GOOGLE_REFRESH_TOKEN);

    const usingPassword = Boolean(user && pass);
    // Senha de app tem prioridade; OAuth só quando não há SMTP_PASS.
    const usingOAuth2 = Boolean(
      clientId && clientSecret && refreshToken && user && !usingPassword,
    );

    if (!host || !portRaw || !user || (!usingOAuth2 && !usingPassword)) {
      this.transportState = 'disabled';
      this.logger.warn(
        'SMTP não configurado. Configure SMTP_HOST/SMTP_PORT/SMTP_USER e (SMTP_PASS ou GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET/GOOGLE_REFRESH_TOKEN).',
      );
      return null;
    }

    const port = Number(portRaw);
    if (Number.isNaN(port)) {
      this.transportState = 'disabled';
      this.logger.warn('SMTP_PORT inválido; e-mail desabilitado.');
      return null;
    }

    const secure = process.env.SMTP_SECURE === 'true' || port === 465;
    const rejectUnauthorized =
      process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== 'false';

    this.transportState = 'ready';
    return nodemailer.createTransport({
      host,
      port,
      secure,
      auth: usingOAuth2
        ? ({
            type: 'OAuth2',
            user,
            clientId,
            clientSecret,
            refreshToken,
          } as const)
        : { user, pass },
      ...(port === 587 || (!secure && port !== 465)
        ? { requireTLS: true }
        : {}),
      tls: { rejectUnauthorized },
      connectionTimeout: 12_000,
      greetingTimeout: 12_000,
      socketTimeout: 20_000,
    });
  }

  private getTransport() {
    if (this.transportState === 'disabled') return null;
    if (this.transport) return this.transport;
    this.transport = this.buildTransport();
    return this.transport;
  }

  /**
   * `MAIL_TRANSPORT=graph` envia pelo Microsoft Graph com a credencial de
   * aplicativo da caixa de entrada — não depende de senha nem de MFA da
   * conta, que foi o que derrubou o SMTP. Sem a variável, segue SMTP.
   */
  private usingGraph(): boolean {
    return envTrim(process.env.MAIL_TRANSPORT)?.toLowerCase() === 'graph';
  }

  /** Endereço da caixa de onde o portal envia — e que ele também lê. */
  private senderMailbox(): string | null {
    const raw =
      envTrim(process.env.MAIL_GRAPH_SENDER) ??
      parseMailAddress(envTrim(process.env.MAIL_FROM) ?? '')?.address ??
      envTrim(process.env.SMTP_USER) ??
      null;
    return raw ? raw.trim().toLowerCase() : null;
  }

  /**
   * Tira a própria caixa da lista de destinatários.
   *
   * O portal lê e envia pelo mesmo endereço. Quando um chamado tem essa
   * caixa como solicitante — são 5.755 em produção, a maioria de rotina —,
   * o aviso de fechamento voltava para cá, era lido como resposta do
   * solicitante e reabria o chamado. O #81667 foi fechado e reaberto três
   * vezes por isso. Mandar e-mail para a própria caixa nunca teve uso.
   */
  private removeSelf(
    list: SendMailPayload['to'] | undefined,
  ): string[] | undefined {
    if (list == null) return undefined;
    const caixa = this.senderMailbox();
    if (!caixa) return Array.isArray(list) ? list : [list];
    const itens = Array.isArray(list) ? list : [list];
    return itens.filter((item) => {
      const endereco = parseMailAddress(item)?.address?.trim().toLowerCase();
      return endereco !== caixa;
    });
  }

  async sendMail(payload: SendMailPayload): Promise<boolean> {
    const to = this.removeSelf(payload.to) ?? [];
    const cc = this.removeSelf(payload.cc);
    if (to.length === 0 && (cc?.length ?? 0) === 0) {
      this.logger.log(
        `E-mail não enviado: só a própria caixa como destinatário (assunto=${payload.subject}).`,
      );
      return false;
    }
    payload = { ...payload, to, ...(cc ? { cc } : {}) };

    if (this.usingGraph()) {
      return this.sendViaGraph(payload);
    }

    const from =
      envTrim(process.env.MAIL_FROM) ??
      envTrim(process.env.SMTP_USER) ??
      'no-reply@alleone.local';

    const transport = this.getTransport();
    if (!transport) {
      const to = Array.isArray(payload.to) ? payload.to.join(', ') : payload.to;
      this.logger.warn(
        `SMTP não configurado: e-mail não enviado (para=${to}, assunto=${payload.subject}).`,
      );
      return false;
    }

    const info = await transport.sendMail({
      from,
      to: payload.to,
      cc: payload.cc,
      replyTo: payload.replyTo,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
      attachments: payload.attachments?.map((item) => ({
        filename: item.filename,
        content: item.content,
        contentType: item.contentType,
        cid: item.cid,
        contentDisposition: item.cid ? 'inline' : 'attachment',
      })),
    });

    this.logger.log(
      `E-mail enviado (messageId: ${String((info as any)?.messageId ?? 'n/d')})`,
    );
    return true;
  }

  private async sendViaGraph(payload: SendMailPayload): Promise<boolean> {
    const from = parseMailAddress(envTrim(process.env.MAIL_FROM) ?? '');
    const mailbox =
      envTrim(process.env.MAIL_GRAPH_SENDER) ??
      from?.address ??
      envTrim(process.env.SMTP_USER);
    const to = parseMailAddressList(payload.to);
    if (!mailbox) {
      this.logger.warn(
        'Graph sem caixa remetente: defina MAIL_GRAPH_SENDER ou MAIL_FROM. E-mail não enviado.',
      );
      return false;
    }
    if (to.length === 0) {
      this.logger.warn(
        `E-mail sem destinatário válido não enviado (assunto=${payload.subject}).`,
      );
      return false;
    }

    // Tenant e aplicativo são os mesmos da leitura da caixa de entrada.
    const settings = await this.prisma.emailInboundSettings.findUnique({
      where: { id: 'default' },
      select: { graphTenantId: true, graphClientId: true },
    });
    const auth = {
      tenantId: settings?.graphTenantId,
      clientId: settings?.graphClientId,
    };
    if (!this.graph.isConfigured(auth)) {
      this.logger.warn(
        `Microsoft Graph não configurado: e-mail não enviado (assunto=${payload.subject}).`,
      );
      return false;
    }

    await this.graph.sendMail(
      {
        mailbox,
        fromName: from?.name ?? null,
        to,
        cc: parseMailAddressList(payload.cc),
        replyTo: parseMailAddressList(payload.replyTo),
        subject: payload.subject,
        text: payload.text,
        html: payload.html,
        attachments: payload.attachments,
      },
      auth,
    );

    this.logger.log(
      `E-mail enviado via Microsoft Graph (${to.length} destinatário(s))`,
    );
    return true;
  }
}
