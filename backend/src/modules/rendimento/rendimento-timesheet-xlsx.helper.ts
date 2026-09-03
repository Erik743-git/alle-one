import ExcelJS from 'exceljs';
import type { RendimentoTimesheetDto } from './rendimento.service';

const HEADER_BAND_FILL = 'FF73D2F2';
const TABLE_HEADER_FILL = 'FF0A2540';
const ROW_ALT_FILL = 'FFEFF3F6';
const TOTAL_ROW_FILL = 'FFD9E2F3';
const THIN_BORDER: Partial<ExcelJS.Border> = {
  style: 'thin',
  color: { argb: 'FFB4C6E7' },
};

function entryTypeLabel(entry: {
  isOvertime: boolean;
  overtimeKind?: 'EXTRA' | 'PLANTAO' | null;
}): string {
  if (!entry.isOvertime) return 'Normal';
  if (entry.overtimeKind === 'PLANTAO') return 'Plantão';
  return 'Hora extra';
}

function formatDateBr(dateOnly: string): string {
  const [y, m, d] = dateOnly.slice(0, 10).split('-');
  if (!y || !m || !d) return dateOnly;
  return `${d}/${m}/${y}`;
}

function weekdayLabel(dateOnly: string): string {
  const date = new Date(`${dateOnly.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  const labels = [
    'Domingo',
    'Segunda',
    'Terça',
    'Quarta',
    'Quinta',
    'Sexta',
    'Sábado',
  ];
  return labels[date.getDay()] ?? '';
}

/**
 * Gera o XLSX de apontamentos de um colaborador para o período do timesheet
 * (tipicamente um mês). Não acessa banco — recebe o mesmo DTO que a tela usa,
 * garantindo que a planilha bate exatamente com o que é exibido.
 */
export async function buildRendimentoTimesheetXlsx(
  timesheet: RendimentoTimesheetDto,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Alle One';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Apontamentos', {
    views: [{ state: 'frozen', ySplit: 8 }],
  });

  sheet.columns = [
    { key: 'date', width: 12 },
    { key: 'weekday', width: 11 },
    { key: 'init', width: 9 },
    { key: 'end', width: 9 },
    { key: 'duration', width: 11 },
    { key: 'type', width: 12 },
    { key: 'ticket', width: 11 },
    { key: 'client', width: 26 },
    { key: 'description', width: 48 },
  ];

  // Faixa de título.
  sheet.mergeCells('A1:I1');
  sheet.getCell('A1').value =
    `Apontamentos — ${timesheet.userName} (${formatDateBr(timesheet.rangeStart)} a ${formatDateBr(timesheet.rangeEnd)})`;
  sheet.getCell('A1').font = { bold: true, size: 16 };
  sheet.getCell('A1').fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: HEADER_BAND_FILL },
  };
  sheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'left' };
  sheet.getRow(1).height = 30;

  // Resumo do período.
  const summaryRows: Array<[string, string]> = [
    ['Total do mês (civil)', timesheet.totalHoursFormatted],
    ['Total normal', timesheet.totalRegularHoursFormatted],
    [
      `Horas extras (${timesheet.periodOvertimeRangeLabel})`,
      timesheet.periodOvertimeFormatted,
    ],
    ['Plantão (mesmo ciclo)', timesheet.periodPlantaoFormatted],
    ['Saldo de horas extras', timesheet.overtimeBalanceFormatted],
  ];
  summaryRows.forEach(([label, value], index) => {
    const rowIndex = 3 + index;
    sheet.getCell(rowIndex, 1).value = label;
    sheet.getCell(rowIndex, 1).font = { bold: true };
    sheet.getCell(rowIndex, 3).value = value;
    sheet.getCell(rowIndex, 3).font = { bold: true };
  });

  const tableHeaderRowIndex = 9;
  const headerRow = sheet.getRow(tableHeaderRowIndex);
  headerRow.values = [
    'Data',
    'Dia',
    'Início',
    'Fim',
    'Duração',
    'Tipo',
    'Ticket',
    'Cliente',
    'Descrição',
  ];
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: TABLE_HEADER_FILL },
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 20;

  let rowIndex = tableHeaderRowIndex + 1;
  let dayStripe = false;
  let grandTotalMinutes = 0;

  const sortedDays = [...timesheet.days].sort((a, b) =>
    a.date.localeCompare(b.date),
  );

  for (const day of sortedDays) {
    if (day.entries.length === 0) continue;
    dayStripe = !dayStripe;
    const dateLabel = formatDateBr(day.date);
    const weekday = weekdayLabel(day.date);

    for (const entry of day.entries) {
      const row = sheet.getRow(rowIndex);
      row.values = [
        dateLabel,
        weekday,
        entry.initTime ?? '',
        entry.endTime ?? '',
        entry.hoursFormatted,
        entryTypeLabel(entry),
        entry.ticketNumber,
        entry.clientName ?? '',
        entry.ticketTitle ?? '',
      ];
      row.alignment = { vertical: 'middle' };
      if (dayStripe) {
        row.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: ROW_ALT_FILL },
        };
      }
      for (let col = 1; col <= 9; col += 1) {
        row.getCell(col).border = {
          top: THIN_BORDER,
          bottom: THIN_BORDER,
          left: THIN_BORDER,
          right: THIN_BORDER,
        };
      }
      grandTotalMinutes += entry.minutes;
      rowIndex += 1;
    }
  }

  const totalRow = sheet.getRow(rowIndex);
  totalRow.getCell(1).value = 'Total apontado (soma bruta)';
  sheet.mergeCells(rowIndex, 1, rowIndex, 4);
  totalRow.getCell(5).value = formatMinutesForXlsx(grandTotalMinutes);
  totalRow.font = { bold: true };
  totalRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: TOTAL_ROW_FILL },
  };

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  // Node 22 tipa Buffer como Buffer<ArrayBufferLike>; ExcelJS devolve ArrayBuffer-like.
  return Buffer.from(arrayBuffer) as unknown as Buffer;
}

function formatMinutesForXlsx(totalMinutes: number): string {
  const total = Math.max(0, Math.trunc(totalMinutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Nome de arquivo seguro para o Content-Disposition. */
export function rendimentoTimesheetXlsxFilename(
  timesheet: RendimentoTimesheetDto,
): string {
  const safeName = timesheet.userName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return `apontamentos-${safeName || 'colaborador'}-${timesheet.rangeStart}.xlsx`;
}
