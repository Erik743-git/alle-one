import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { TifluxModule } from '../tiflux/tiflux.module';
import { ProjetosModule } from '../projetos/projetos.module';
import { AuditModule } from '../audit/audit.module';
import { MailModule } from '../mail/mail.module';
import { PermissionsModule } from '../permissions/permissions.module';
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
import { TicketListPresetsService } from './ticket-list-presets.service';
import { TicketAutomationService } from './ticket-automation.service';
import { TicketAutomationIdleJob } from './ticket-automation-idle.job';

@Module({
  imports: [
    PrismaModule,
    TifluxModule,
    FileStorageModule,
    ProjetosModule,
    AuditModule,
    MailModule,
    PermissionsModule,
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
    TicketListPresetsService,
    TicketAutomationService,
    TicketAutomationIdleJob,
  ],
  exports: [
    TicketsService,
    TicketsQueryService,
    TicketsAppointmentsService,
    TicketsCatalogsService,
    TicketsPortalStoreService,
    TicketsOutboxService,
    TicketsReconcileService,
    TicketAutomationService,
  ],
})
export class TicketsModule {}
