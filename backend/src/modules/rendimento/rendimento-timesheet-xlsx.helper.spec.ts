import ExcelJS from 'exceljs';
import { buildRendimentoTimesheetXlsx } from './rendimento-timesheet-xlsx.helper';
import type { RendimentoTimesheetDto } from './rendimento.service';

describe('buildRendimentoTimesheetXlsx', () => {
  it('resumo no período da planilha e descrição do apontamento', async () => {
    const timesheet = {
      userName: 'Pessoa',
      rangeStart: '2026-08-26',
      rangeEnd: '2026-09-25',
      totalHoursFormatted: '19:30',
      totalRegularHoursFormatted: '05:30',
      totalOvertimeFormatted: '14:00',
      totalPlantaoFormatted: '00:00',
      periodOvertimeRangeLabel: '26/08 a 25/09',
      overtimeBalanceFormatted: '+01:30',
      days: [
        {
          date: '2026-09-04',
          entries: [
            {
              initTime: '19:00',
              endTime: '20:00',
              hoursFormatted: '01:00',
              isOvertime: false,
              ticketNumber: 76550,
              clientName: 'Cliente',
              ticketTitle: 'Título do chamado',
              description: 'Texto do apontamento',
              minutes: 60,
            },
          ],
        },
      ],
    } as unknown as RendimentoTimesheetDto;

    const buffer = await buildRendimentoTimesheetXlsx(timesheet);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    const sheet = workbook.getWorksheet('Apontamentos')!;
    const cell = (r: number, c: number) => String(sheet.getCell(r, c).value);

    expect(cell(3, 1)).toBe('Total do período (26/08/2026 a 25/09/2026)');
    expect(cell(3, 3)).toBe('19:30');
    expect(cell(5, 1)).toBe('Horas extras');
    expect(cell(5, 3)).toBe('14:00');
    expect(cell(9, 9)).toBe('Título do chamado');
    expect(cell(9, 10)).toBe('Descrição do apontamento');
    expect(cell(10, 9)).toBe('Título do chamado');
    expect(cell(10, 10)).toBe('Texto do apontamento');
  });
});
