import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { TifluxModule } from '../tiflux/tiflux.module';
import { TicketsController } from './tickets.controller';
import { TicketsOutboxJob } from './tickets-outbox.job';
import { TicketsOutboxService } from './tickets-outbox.service';
import { TicketsService } from './tickets.service';

@Module({
  imports: [PrismaModule, TifluxModule],
  controllers: [TicketsController],
  providers: [TicketsService, TicketsOutboxService, TicketsOutboxJob],
  exports: [TicketsService, TicketsOutboxService],
})
export class TicketsModule {}
