import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../prisma/prisma.module';
import { TifluxModule } from '../modules/tiflux/tiflux.module';
import { TicketsOutboxService } from '../modules/tickets/tickets-outbox.service';
import { TicketsOutboxWorkerJob } from './tickets-outbox-worker.job';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    TifluxModule,
  ],
  providers: [TicketsOutboxService, TicketsOutboxWorkerJob],
})
export class OutboxWorkerModule {}
