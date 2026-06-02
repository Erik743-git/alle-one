import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { TifluxModule } from '../tiflux/tiflux.module';
import { AuditModule } from '../audit/audit.module';
import { RendimentoController } from './rendimento.controller';
import { RendimentoService } from './rendimento.service';

@Module({
  imports: [PrismaModule, TifluxModule, AuditModule],
  controllers: [RendimentoController],
  providers: [RendimentoService],
  exports: [RendimentoService],
})
export class RendimentoModule {}
