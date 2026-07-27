import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { DashboardChartsService } from './dashboard-charts.service';
import { DashboardIntegrationsService } from './dashboard-integrations.service';
import { DashboardHoursService } from './dashboard-hours.service';
import { TifluxModule } from '../tiflux/tiflux.module';
import { ZabbixModule } from '../zabbix/zabbix.module';
@Module({
  imports: [TifluxModule, ZabbixModule],
  controllers: [DashboardController],
  providers: [
    DashboardService,
    DashboardChartsService,
    DashboardIntegrationsService,
    DashboardHoursService,
  ],
  exports: [DashboardService],
})
export class DashboardModule {}
