import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { TifluxModule } from '../tiflux/tiflux.module';
import { ProjetosModule } from '../projetos/projetos.module';
import { TicketsController } from './tickets.controller';
import { FileStorageModule } from '../../common/storage/file-storage.module';
import { TicketsOutboxJob } from './tickets-outbox.job';
import { TicketsOutboxService } from './tickets-outbox.service';
import { TicketsReconcileService } from './tickets-reconcile.service';
import { TicketsService } from './tickets.service';

@Module({
  imports: [PrismaModule, TifluxModule, FileStorageModule, ProjetosModule],
  controllers: [TicketsController],
  providers: [
    TicketsService,
    TicketsOutboxService,
    TicketsOutboxJob,
    TicketsReconcileService,
  ],
  exports: [TicketsService, TicketsOutboxService, TicketsReconcileService],
})
export class TicketsModule {}
