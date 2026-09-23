import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { TifluxModule } from '../tiflux/tiflux.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { RendimentoModule } from '../rendimento/rendimento.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ReportsInventarioService } from './reports-inventario.service';
import { ReportPdfPreviewService } from './report-pdf-preview.service';

@Module({
  imports: [PrismaModule, TifluxModule, DashboardModule, RendimentoModule],
  controllers: [ReportsController],
  providers: [
    ReportsService,
    ReportsInventarioService,
    ReportPdfPreviewService,
  ],
})
export class ReportsModule {}
