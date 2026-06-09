import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { RendimentoModule } from '../rendimento/rendimento.module';
import { UsersModule } from '../users/users.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { DeskClassificationService } from './desk-classification.service';

@Module({
  imports: [PrismaModule, RendimentoModule, UsersModule],
  controllers: [AdminController],
  providers: [AdminService, DeskClassificationService],
})
export class AdminModule {}
