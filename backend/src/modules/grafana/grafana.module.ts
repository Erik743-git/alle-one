import { Module } from '@nestjs/common';
import { GrafanaController } from './grafana.controller';
import { GrafanaService } from './grafana.service';

@Module({
  controllers: [GrafanaController],
  providers: [GrafanaService],
  exports: [GrafanaService],
})
export class GrafanaModule {}
