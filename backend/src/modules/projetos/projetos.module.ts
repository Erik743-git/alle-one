import { Module } from '@nestjs/common';
import { FileStorageModule } from '../../common/storage/file-storage.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { ProjetosController } from './projetos.controller';
import { ProjetosDocumentsService } from './projetos-documents.service';
import { ProjetosHistoryPdfService } from './projetos-history-pdf.service';
import { ProjetosExcelService, ProjetosService } from './projetos.service';

@Module({
  imports: [PrismaModule, AuditModule, FileStorageModule],
  controllers: [ProjetosController],
  providers: [
    ProjetosService,
    ProjetosExcelService,
    ProjetosDocumentsService,
    ProjetosHistoryPdfService,
  ],
  exports: [ProjetosService],
})
export class ProjetosModule {}
