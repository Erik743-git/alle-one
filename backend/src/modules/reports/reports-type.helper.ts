import { BadRequestException } from '@nestjs/common';
import { ReportFormat, ReportType } from '@prisma/client';

export function toReportType(value: string): ReportType {
  if (value === '4') return ReportType.ESTATISTICA_GERAL;
  if (value === '5') return ReportType.INVENTARIO;
  if (value === '6') return ReportType.COBRANCA;
  if (value === '1') return ReportType.RENDIMENTO;
  throw new BadRequestException(
    'Tipo de relatório inválido. Use Rendimento (1), Estatística Geral (4), Inventário (5) ou Cobrança (6).',
  );
}

export function toReportFormat(value: string): ReportFormat {
  const normalized = value.trim().toUpperCase();
  if (normalized === 'XLSX') return ReportFormat.XLSX;
  if (normalized === 'CSV') return ReportFormat.CSV;
  throw new BadRequestException('format inválido (use CSV ou XLSX)');
}
