import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { PainelChamadosController } from './painel-chamados.controller';
import { PainelChamadosService } from './painel-chamados.service';

@Module({
  imports: [PrismaModule],
  controllers: [PainelChamadosController],
  providers: [PainelChamadosService],
})
export class PainelChamadosModule {}
