import { Module } from '@nestjs/common';
import { ZabbixModule } from '../zabbix/zabbix.module';
import { ConsoleController } from './console.controller';
import { ConsoleService } from './console.service';

@Module({
  imports: [ZabbixModule],
  controllers: [ConsoleController],
  providers: [ConsoleService],
  exports: [ConsoleService],
})
export class ConsoleModule {}
