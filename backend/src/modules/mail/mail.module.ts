import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { MailService } from './mail.service';
import { EmailTemplatesService } from './email-templates.service';
import { MicrosoftGraphMailClient } from '../email-inbound/microsoft-graph-mail.client';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [MailService, EmailTemplatesService, MicrosoftGraphMailClient],
  exports: [MailService, EmailTemplatesService],
})
export class MailModule {}
