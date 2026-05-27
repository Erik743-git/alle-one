import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { TifluxModule } from '../tiflux/tiflux.module';
import { TifluxSyncService } from './tiflux-sync.service';

@Module({
  imports: [PrismaModule, TifluxModule],
  providers: [TifluxSyncService],
})
export class TifluxSyncModule {}
