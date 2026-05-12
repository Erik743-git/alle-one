import { Module } from '@nestjs/common';
import { ZabbixController } from './zabbix.controller';
import { ZabbixService } from './zabbix.service';

@Module({
  controllers: [ZabbixController],
  providers: [ZabbixService],
  exports: [ZabbixService],
})
export class ZabbixModule {}
