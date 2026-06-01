import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { RendimentoModule } from '../rendimento/rendimento.module';
import { InventarioModule } from '../inventario/inventario.module';
import { MailboxController } from './mailbox.controller';
import { MailboxJob } from './mailbox.job';
import { MailboxService } from './mailbox.service';

@Module({
  imports: [PrismaModule, DashboardModule, RendimentoModule, InventarioModule],
  controllers: [MailboxController],
  providers: [MailboxService, MailboxJob],
  exports: [MailboxService],
})
export class MailboxModule {}
