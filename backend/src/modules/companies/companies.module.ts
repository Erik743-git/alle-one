import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { CompaniesController } from './companies.controller';
import { CompaniesSessionController } from './companies-session.controller';
import { CompaniesService } from './companies.service';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [CompaniesController, CompaniesSessionController],
  providers: [CompaniesService],
})
export class CompaniesModule {}
