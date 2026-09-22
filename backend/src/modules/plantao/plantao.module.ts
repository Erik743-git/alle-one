import { Module } from '@nestjs/common';
import { MicrosoftGraphMailClient } from '../email-inbound/microsoft-graph-mail.client';
import { PlantaoController } from './plantao.controller';
import { PlantaoService } from './plantao.service';

@Module({
  controllers: [PlantaoController],
  providers: [PlantaoService, MicrosoftGraphMailClient],
  exports: [PlantaoService],
})
export class PlantaoModule {}
