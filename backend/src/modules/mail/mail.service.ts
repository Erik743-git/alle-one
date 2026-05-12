import { Injectable, Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';

type SendMailPayload = {
  to: string[] | string;
  subject: string;
  text: string;
  html?: string;
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

function redact(value: string | undefined): string {
  if (!value) return '(vazio)';
  if (value.length <= 6) return '***';
  return `${value.slice(0, 3)}***${value.slice(-3)}`;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transport: nodemailer.Transporter | null = null;
  private transportState: 'unknown' | 'disabled' | 'ready' = 'unknown';

  private buildTransport() {
    const host = envTrim(process.env.SMTP_HOST);
    const portRaw = envTrim(process.env.SMTP_PORT);
    const user = envTrim(process.env.SMTP_USER);
    const pass = envTrim(process.env.SMTP_PASS);

    const clientId = envTrim(process.env.GOOGLE_CLIENT_ID);
    const clientSecret = envTrim(process.env.GOOGLE_CLIENT_SECRET);
    const refreshToken = envTrim(process.env.GOOGLE_REFRESH_TOKEN);

    const usingOAuth2 = Boolean(
      clientId && clientSecret && refreshToken && user,
    );
    const usingPassword = Boolean(user && pass);

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

    if (process.env.NODE_ENV !== 'production') {
      this.logger.log(
        `[DEV] SMTP config: host=${host} port=${port} secure=${secure} user=${user} auth=${
          usingOAuth2 ? 'oauth2' : 'password'
        } from=${redact(envTrim(process.env.MAIL_FROM))}`,
      );
    }

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
      ...(process.env.NODE_ENV !== 'production'
        ? { logger: true, debug: true }
        : {}),
    });
  }

  private getTransport() {
    if (this.transportState === 'disabled') return null;
    if (this.transport) return this.transport;
    this.transport = this.buildTransport();
    return this.transport;
  }

  async sendMail(payload: SendMailPayload) {
    const from =
      envTrim(process.env.MAIL_FROM) ??
      envTrim(process.env.SMTP_USER) ??
      'no-reply@alleone.local';

    const transport = this.getTransport();
    if (!transport) {
      // Fallback: log em dev para não "sumir" a notificação.
      this.logger.log('--- EMAIL (sem SMTP) ---');
      this.logger.log(
        `Para: ${Array.isArray(payload.to) ? payload.to.join(', ') : payload.to}`,
      );
      this.logger.log(`Assunto: ${payload.subject}`);
      this.logger.log(payload.text);
      this.logger.log('------------------------');
      return;
    }

    const info = await transport.sendMail({
      from,
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
    });

    this.logger.log(
      `E-mail enviado (messageId: ${String((info as any)?.messageId ?? 'n/d')})`,
    );
  }
}
