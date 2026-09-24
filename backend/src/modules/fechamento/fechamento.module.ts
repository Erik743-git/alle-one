import { Global, Module } from '@nestjs/common';

import { FechamentoController } from './fechamento.controller';
import { FechamentoService } from './fechamento.service';
import { PeriodoFechadoService } from './periodo-fechado.service';

/** Global: a trava de ciclo fechado é usada pelos apontamentos (Tickets). */
@Global()
@Module({
  controllers: [FechamentoController],
  providers: [FechamentoService, PeriodoFechadoService],
  exports: [PeriodoFechadoService],
})
export class FechamentoModule {}
