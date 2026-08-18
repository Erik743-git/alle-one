import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { TifluxModule } from '../tiflux/tiflux.module';
import { ProjetosModule } from '../projetos/projetos.module';
import { AuditModule } from '../audit/audit.module';
import { MailModule } from '../mail/mail.module';
import { TicketsController } from './tickets.controller';
import { FileStorageModule } from '../../common/storage/file-storage.module';
import { TicketsAppointmentsService } from './tickets-appointments.service';
import { TicketsCatalogsService } from './tickets-catalogs.service';
import { TicketsOutboxJob } from './tickets-outbox.job';
import { TicketsOutboxService } from './tickets-outbox.service';
import { TicketsReconcileService } from './tickets-reconcile.service';
import { TicketsQueryService } from './tickets-query.service';
import { TicketsPortalStoreService } from './tickets-portal-store.service';
import { TicketsService } from './tickets.service';

@Module({
  imports: [
    PrismaModule,
    TifluxModule,
    FileStorageModule,
    ProjetosModule,
    AuditModule,
    MailModule,
  ],
  controllers: [TicketsController],
  providers: [
    TicketsPortalStoreService,
    TicketsAppointmentsService,
    TicketsCatalogsService,
    TicketsQueryService,
    TicketsService,
    TicketsOutboxService,
    TicketsOutboxJob,
    TicketsReconcileService,
  ],
  exports: [
    TicketsService,
    TicketsQueryService,
    TicketsAppointmentsService,
    TicketsCatalogsService,
    TicketsPortalStoreService,
    TicketsOutboxService,
    TicketsReconcileService,
  ],
})
export class TicketsModule {}
