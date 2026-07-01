import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { InventarioController } from './inventario.controller';
import { InventarioImportService } from './inventario-import.service';
import { InventarioService } from './inventario.service';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [InventarioController],
  providers: [InventarioService, InventarioImportService],
  exports: [InventarioService],
})
export class InventarioModule {}
