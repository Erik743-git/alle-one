import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { TifluxModule } from '../tiflux/tiflux.module';
import { RendimentoController } from './rendimento.controller';
import { RendimentoService } from './rendimento.service';

@Module({
  imports: [PrismaModule, TifluxModule],
  controllers: [RendimentoController],
  providers: [RendimentoService],
  exports: [RendimentoService],
})
export class RendimentoModule {}
