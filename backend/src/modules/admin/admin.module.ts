import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { RendimentoModule } from '../rendimento/rendimento.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [PrismaModule, RendimentoModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
