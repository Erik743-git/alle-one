import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { FileStorageModule } from '../../common/storage/file-storage.module';
import { TicketsModule } from '../tickets/tickets.module';
import { TifluxModule } from '../tiflux/tiflux.module';
import { EmailInboundController } from './email-inbound.controller';
import { EmailInboundAdminService } from './email-inbound-admin.service';
import { EmailInboundIngestService } from './email-inbound-ingest.service';
import { EmailInboundPollJob } from './email-inbound-poll.job';
import { EmailInboundWorkerService } from './email-inbound-worker.service';
import { MicrosoftGraphMailClient } from './microsoft-graph-mail.client';
import { PreTicketsService } from './pre-tickets.service';

@Module({
  imports: [PrismaModule, FileStorageModule, TicketsModule, TifluxModule],
  controllers: [EmailInboundController],
  providers: [
    MicrosoftGraphMailClient,
    EmailInboundIngestService,
    EmailInboundAdminService,
    PreTicketsService,
    EmailInboundPollJob,
    EmailInboundWorkerService,
  ],
  exports: [PreTicketsService, EmailInboundIngestService],
})
export class EmailInboundModule {}
