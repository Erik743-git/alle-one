import { BadRequestException } from '@nestjs/common';
import { ReportFormat, ReportType } from '@prisma/client';
import { toReportFormat, toReportType } from './reports-type.helper';

describe('reports-type.helper', () => {
  it('mapeia tipos de relatório válidos', () => {
    expect(toReportType('1')).toBe(ReportType.RENDIMENTO);
    expect(toReportType('4')).toBe(ReportType.ESTATISTICA_GERAL);
    expect(toReportType('5')).toBe(ReportType.INVENTARIO);
  });

  it('rejeita tipo de relatório inválido', () => {
    expect(() => toReportType('9')).toThrow(BadRequestException);
  });

  it('mapeia formatos válidos', () => {
    expect(toReportFormat('xlsx')).toBe(ReportFormat.XLSX);
    expect(toReportFormat('CSV')).toBe(ReportFormat.CSV);
  });

  it('rejeita formato inválido', () => {
    expect(() => toReportFormat('pdf')).toThrow(BadRequestException);
  });
});
