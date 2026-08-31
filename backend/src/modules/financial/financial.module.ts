import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { FinancialController } from './financial.controller';
import { FinancialService } from './financial.service';

@Module({
  imports: [PrismaModule, DashboardModule],
  controllers: [FinancialController],
  providers: [FinancialService],
})
export class FinancialModule {}
