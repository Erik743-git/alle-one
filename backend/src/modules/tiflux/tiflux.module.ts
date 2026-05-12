import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { TifluxController } from './tiflux.controller';
import { TifluxService } from './tiflux.service';

@Module({
  imports: [PrismaModule],
  controllers: [TifluxController],
  providers: [TifluxService],
  exports: [TifluxService],
})
export class TifluxModule {}
