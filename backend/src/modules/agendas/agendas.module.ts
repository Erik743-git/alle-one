import { Module } from '@nestjs/common';

import { EscalaController } from './escala.controller';
import { EscalaService } from './escala.service';
import { ManutencaoController } from './manutencao.controller';
import { ManutencaoService } from './manutencao.service';

/** Agendas: Plantão (Outlook), Escala e Manutenção. */
@Module({
  controllers: [EscalaController, ManutencaoController],
  providers: [EscalaService, ManutencaoService],
})
export class AgendasModule {}
