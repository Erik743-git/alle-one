import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { ZabbixModule } from '../zabbix/zabbix.module';
import { CompaniesController } from './companies.controller';
import { CompaniesSessionController } from './companies-session.controller';
import { CompaniesService } from './companies.service';

@Module({
  imports: [PrismaModule, AuditModule, ZabbixModule, PermissionsModule],
  controllers: [CompaniesController, CompaniesSessionController],
  providers: [CompaniesService],
})
export class CompaniesModule {}
