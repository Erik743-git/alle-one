import { Module } from '@nestjs/common';

import { DashboardModule } from '../dashboard/dashboard.module';
import { ContratoTravaService } from './contrato-trava.service';

@Module({
  imports: [DashboardModule],
  providers: [ContratoTravaService],
  exports: [ContratoTravaService],
})
export class ContratoTravaModule {}
