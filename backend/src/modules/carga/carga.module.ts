import { Module } from '@nestjs/common';

import { CargaController } from './carga.controller';
import { CargaService } from './carga.service';

@Module({ controllers: [CargaController], providers: [CargaService] })
export class CargaModule {}
