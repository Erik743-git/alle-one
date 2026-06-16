import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ZabbixController } from './zabbix.controller';
import { ZabbixDbService } from './zabbix-db.service';
import { ZabbixService } from './zabbix.service';

@Module({
  imports: [PrismaModule],
  controllers: [ZabbixController],
  providers: [ZabbixService, ZabbixDbService],
  exports: [ZabbixService],
})
export class ZabbixModule {}
