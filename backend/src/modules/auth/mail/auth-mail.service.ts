import { Injectable, Logger } from '@nestjs/common';
import { MailService } from '../../mail/mail.service';

type ResetPasswordMailPayload = {
  to: string;
  name: string;
  resetCode: string;
  resetPageUrl: string;
  expiresMinutes: number;
};

type SupportRequestMailPayload = {
  nome: string;
  empresa: string;
  email: string;
  mensagem: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

@Injectable()
export class AuthMailService {
  private readonly logger = new Logger(AuthMailService.name);
  constructor(private readonly mail: MailService) {}

  async sendResetPassword(payload: ResetPasswordMailPayload): Promise<boolean> {
    const subject = 'Código para redefinir senha — Alle One';
    const text =
      `Olá, ${payload.name}.\n\n` +
      `Seu código para redefinir a senha no Alle One é: ${payload.resetCode}\n\n` +
      `Válido por ${payload.expiresMinutes} minutos.\n` +
      `Acesse ${payload.resetPageUrl}, informe o código e defina uma nova senha.\n\n` +
      `Se você não solicitou isso, ignore este e-mail.\n`;

    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color:#0f172a;">
        <p>Olá, <strong>${payload.name}</strong>.</p>
        <p>Recebemos uma solicitação para redefinir sua senha no <strong>Alle One</strong>.</p>
        <p style="margin:20px 0;font-size:14px;color:#475569;">Use o código abaixo no portal:</p>
        <p style="margin:0 0 20px;font-size:32px;font-weight:800;letter-spacing:6px;color:#08182f;">
          ${payload.resetCode}
        </p>
        <p style="font-size:13px;color:#64748b;">Válido por ${payload.expiresMinutes} minutos.</p>
        <p>
          <a href="${payload.resetPageUrl}" style="display:inline-block;padding:10px 14px;background:#12b5d9;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;">
            Informar código e nova senha
          </a>
        </p>
        <p style="color:#666;font-size:12px">Se você não solicitou isso, ignore este e-mail.</p>
      </div>
    `;

    try {
      const sent = await this.mail.sendMail({
        to: payload.to,
        subject,
        text,
        html,
      });
      if (!sent) {
        this.logger.error(
          `E-mail de redefinição não enviado (SMTP indisponível) para ${payload.to}.`,
        );
        return false;
      }
      this.logger.log(`E-mail de redefinição enviado para ${payload.to}`);
      return true;
    } catch (err) {
      this.logger.error(
        `Falha ao enviar e-mail de redefinição para ${payload.to}.`,
        err instanceof Error ? err.message : String(err),
      );
      return false;
    }
  }

  /**
   * Envia para a caixa compartilhada (Graph) → poll cria pré-ticket.
   * Destino: SUPPORT_INBOUND_TO ou alleone.teste@alletecnologia.com
   */
  async sendSupportRequest(
    payload: SupportRequestMailPayload,
  ): Promise<boolean> {
    const to =
      process.env.SUPPORT_INBOUND_TO?.trim() ||
      'alleone.teste@alletecnologia.com';
    const subject = `Solicitação de suporte - Alle One — ${payload.empresa}`;
    const text = [
      'Nova solicitação de suporte pelo portal Alle One.',
      '',
      `Nome: ${payload.nome}`,
      `Empresa: ${payload.empresa}`,
      `E-mail para retorno: ${payload.email}`,
      '',
      'Mensagem:',
      payload.mensagem,
    ].join('\n');

    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color:#0f172a;">
        <p><strong>Nova solicitação de suporte</strong> pelo portal Alle One.</p>
        <ul>
          <li><strong>Nome:</strong> ${escapeHtml(payload.nome)}</li>
          <li><strong>Empresa:</strong> ${escapeHtml(payload.empresa)}</li>
          <li><strong>E-mail para retorno:</strong> ${escapeHtml(payload.email)}</li>
        </ul>
        <p><strong>Mensagem:</strong></p>
        <p style="white-space:pre-wrap;">${escapeHtml(payload.mensagem)}</p>
      </div>
    `;

    try {
      const sent = await this.mail.sendMail({
        to,
        replyTo: payload.email,
        subject,
        text,
        html,
      });
      if (!sent) {
        this.logger.error(
          `E-mail de suporte não enviado (SMTP indisponível) para ${to}.`,
        );
        return false;
      }
      this.logger.log(
        `E-mail de suporte enviado para ${to} (replyTo=${payload.email})`,
      );
      return true;
    } catch (err) {
      this.logger.error(
        `Falha ao enviar e-mail de suporte para ${to}.`,
        err instanceof Error ? err.message : String(err),
      );
      return false;
    }
  }
}
