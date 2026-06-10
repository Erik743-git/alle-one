import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { TifluxModule } from '../tiflux/tiflux.module';
import { AuditModule } from '../audit/audit.module';
import { MailModule } from '../mail/mail.module';
import { RendimentoController } from './rendimento.controller';
import { RendimentoCompanyService } from './rendimento-company.service';
import { RendimentoMailService } from './rendimento-mail.service';
import { RendimentoService } from './rendimento.service';
import { RendimentoStoreService } from './rendimento-store.service';

@Module({
  imports: [PrismaModule, TifluxModule, AuditModule, MailModule],
  controllers: [RendimentoController],
  providers: [
    RendimentoService,
    RendimentoStoreService,
    RendimentoCompanyService,
    RendimentoMailService,
  ],
  exports: [RendimentoService, RendimentoCompanyService],
})
export class RendimentoModule {}
