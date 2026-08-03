import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { MailService } from './mail.service';
import { EmailTemplatesService } from './email-templates.service';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [MailService, EmailTemplatesService],
  exports: [MailService, EmailTemplatesService],
})
export class MailModule {}
