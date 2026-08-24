import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { RendimentoModule } from '../rendimento/rendimento.module';
import { TicketsModule } from '../tickets/tickets.module';
import { UsersModule } from '../users/users.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { DeskClassificationService } from './desk-classification.service';
import { TicketStageService } from './ticket-stage.service';
import { TicketAutoOpenService } from './ticket-auto-open.service';
import { TicketAutoOpenJob } from './ticket-auto-open.job';

@Module({
  imports: [
    PrismaModule,
    RendimentoModule,
    TicketsModule,
    UsersModule,
    PermissionsModule,
  ],
  controllers: [AdminController],
  providers: [
    AdminService,
    DeskClassificationService,
    TicketStageService,
    TicketAutoOpenService,
    TicketAutoOpenJob,
  ],
})
export class AdminModule {}
