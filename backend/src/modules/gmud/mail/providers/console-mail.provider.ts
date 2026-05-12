import { Injectable, Logger } from '@nestjs/common';

type MailMessage = {
  to: string[];
  subject: string;
  text: string;
  html?: string;
};

@Injectable()
export class ConsoleMailProvider {
  private readonly logger = new Logger(ConsoleMailProvider.name);

  async sendMail(message: MailMessage) {
    if (process.env.NODE_ENV === 'production') {
      this.logger.warn(
        `E-mail não enviado: ConsoleMailProvider ativo em produção (destinatários: ${message.to.length}, assunto: ${message.subject}). Configure SMTP/OAuth.`,
      );
      return;
    }

    this.logger.debug('EMAIL (ConsoleMailProvider)');
    this.logger.debug(`to: ${message.to.join(', ')}`);
    this.logger.debug(`subject: ${message.subject}`);
    this.logger.debug(`text: ${message.text}`);
  }
}
