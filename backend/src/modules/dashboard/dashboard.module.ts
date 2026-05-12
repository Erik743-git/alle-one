import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { TifluxModule } from '../tiflux/tiflux.module';
import { ZabbixModule } from '../zabbix/zabbix.module';
@Module({
  imports: [TifluxModule, ZabbixModule],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
