import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { UsageAlertsController } from './usage-alerts.controller';
import { UsageAlertsService } from './usage-alerts.service';
import { UsageAlertsJob } from './usage-alerts.job';
import { DashboardModule } from '../dashboard/dashboard.module';

@Module({
  imports: [PrismaModule, DashboardModule],
  controllers: [UsageAlertsController],
  providers: [UsageAlertsService, UsageAlertsJob],
  exports: [UsageAlertsService],
})
export class UsageAlertsModule {}
