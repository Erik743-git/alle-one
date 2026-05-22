import { Injectable, Logger } from '@nestjs/common';
import { MailService } from '../../mail/mail.service';

type ResetPasswordMailPayload = {
  to: string;
  name: string;
  resetUrl: string;
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
export class AuthMailService {
  private readonly logger = new Logger(AuthMailService.name);
  constructor(private readonly mail: MailService) {}

  async sendResetPassword(payload: ResetPasswordMailPayload) {
    const subject = 'Redefinição de senha — Alle One';
    const text = `Olá, ${payload.name}.\n\nRecebemos uma solicitação para redefinir sua senha.\n\nAcesse o link para criar uma nova senha:\n${payload.resetUrl}\n\nSe você não solicitou isso, ignore este e-mail.\n`;

    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.5;">
        <p>Olá, <strong>${payload.name}</strong>.</p>
        <p>Recebemos uma solicitação para redefinir sua senha.</p>
        <p>
          <a href="${payload.resetUrl}" style="display:inline-block;padding:10px 14px;background:#12b5d9;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;">
            Redefinir senha
          </a>
        </p>
        <p style="color:#666;font-size:12px">Se você não solicitou isso, ignore este e-mail.</p>
      </div>
    `;

    try {
      await this.mail.sendMail({ to: payload.to, subject, text, html });
      this.logger.log(`E-mail de redefinição processado para ${payload.to}`);
    } catch (err) {
      const anyErr = err;
      if (process.env.NODE_ENV !== 'production') {
        this.logger.error(
          `[DEV] Detalhes do erro SMTP/OAuth: ` +
            `name=${anyErr?.name ?? 'n/d'} ` +
            `code=${anyErr?.code ?? 'n/d'} ` +
            `responseCode=${anyErr?.responseCode ?? 'n/d'} ` +
            `command=${anyErr?.command ?? 'n/d'} ` +
            `response=${anyErr?.response ?? 'n/d'}`,
        );
      }
      this.logger.error(
        `Falha ao enviar e-mail para ${payload.to}. Verifique SMTP_HOST/PORTA/USUÁRIO/SENHA e firewall.`,
        err instanceof Error ? err.stack : String(err),
      );
      if (process.env.NODE_ENV !== 'production') {
        this.logger.warn(
          `[DEV] Link de redefinição (use manualmente): ${payload.resetUrl}`,
        );
      }
    }
  }
}
