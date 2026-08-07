import { existsSync } from 'fs';
import ExcelJS from 'exceljs';

export type InventarioReportRow = {
  companyName?: string;
  assetTypeName: string;
  brand: string | null;
  quantity: number | null;
  supplier: string | null;
  supplierThirdParty: boolean;
  description: string | null;
  dueDate: string | null;
  reminderDaysBefore: number | null;
  overdue: boolean;
};

function escapeCsv(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function formatDueDate(value: string | null) {
  if (!value) return '';
  const d = new Date(`${value.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('pt-BR');
}

function formatReminder(days: number | null) {
  if (days == null) return '';
  return `${days} dias antes`;
}

function formatDueStatus(row: InventarioReportRow) {
  if (!row.dueDate) return 'Sem vencimento';
  if (row.overdue) return 'Vencido';
  return 'Em dia';
}

function rowToValues(row: InventarioReportRow, multiCompany: boolean) {
  const base = [
    row.assetTypeName,
    row.brand?.trim() || '',
    row.quantity != null ? String(row.quantity) : '',
    row.supplier?.trim() || '',
    row.supplierThirdParty ? 'Sim' : 'Não',
    row.description?.trim() || '',
    formatDueDate(row.dueDate),
    formatReminder(row.reminderDaysBefore),
    formatDueStatus(row),
  ];
  if (multiCompany) {
    return [row.companyName?.trim() || '', ...base];
  }
  return base;
}

const CSV_HEADERS_SINGLE = [
  'tipo',
  'marca',
  'quantidade',
  'fornecedor',
  'fornecedor_terceiro',
  'descricao',
  'vencimento',
  'lembrete',
  'status_vencimento',
];

const CSV_HEADERS_MULTI = ['empresa', ...CSV_HEADERS_SINGLE];

const XLSX_HEADERS_SINGLE = [
  'Tipo',
  'Marca',
  'Quantidade',
  'Fornecedor',
  'Fornecedor terceiro',
  'Descrição',
  'Vencimento',
  'Lembrete',
  'Status vencimento',
];

const XLSX_HEADERS_MULTI = ['Empresa', ...XLSX_HEADERS_SINGLE];

export function buildInventarioReportCsv(params: {
  scopeLabel: string;
  generatedAt: Date;
  rows: InventarioReportRow[];
  multiCompany: boolean;
}) {
  const generatedLabel = params.generatedAt
    .toISOString()
    .slice(0, 19)
    .replace('T', ' ');

  const meta = [
    escapeCsv('Relatório de Inventário'),
    '',
    escapeCsv(`Empresas: ${params.scopeLabel}`),
    escapeCsv(`Gerado em: ${generatedLabel}`),
    '',
  ].join('\n');

  const headers = params.multiCompany ? CSV_HEADERS_MULTI : CSV_HEADERS_SINGLE;
  const lines = params.rows.map((row) =>
    rowToValues(row, params.multiCompany)
      .map((value) => escapeCsv(value))
      .join(','),
  );

  return [meta, headers.join(','), ...lines].join('\n');
}

export async function buildInventarioReportXlsx(params: {
  scopeLabel: string;
  generatedAt: Date;
  rows: InventarioReportRow[];
  multiCompany: boolean;
  logoPath?: string | null;
  logoMimeType?: string | null;
}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Alle One';
  workbook.created = params.generatedAt;

  const lastCol = params.multiCompany ? 'J' : 'I';
  const headers = params.multiCompany
    ? XLSX_HEADERS_MULTI
    : XLSX_HEADERS_SINGLE;
  const statusCol = params.multiCompany ? 10 : 9;

  const sheet = workbook.addWorksheet('Inventário', {
    views: [{ state: 'frozen', ySplit: 7 }],
  });

  sheet.getColumn(1).width = params.multiCompany ? 22 : 24;
  sheet.getColumn(2).width = params.multiCompany ? 24 : 18;
  sheet.getColumn(3).width = params.multiCompany ? 18 : 12;
  sheet.getColumn(4).width = 12;
  sheet.getColumn(5).width = 22;
  sheet.getColumn(6).width = 18;
  sheet.getColumn(7).width = 40;
  sheet.getColumn(8).width = 14;
  sheet.getColumn(9).width = 16;
  sheet.getColumn(10).width = 18;

  sheet.mergeCells(`A1:${lastCol}1`);
  sheet.getCell('A1').value = 'Relatório de Inventário';
  sheet.getCell('A1').font = {
    bold: true,
    size: 16,
    color: { argb: 'FFFFFFFF' },
  };
  sheet.getCell('A1').fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF08182F' },
  };
  sheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'left' };
  sheet.getRow(1).height = 28;

  sheet.getCell('A2').value = 'Empresas:';
  sheet.getCell('B2').value = params.scopeLabel;
  sheet.getCell('A3').value = 'Gerado em:';
  sheet.getCell('B3').value = params.generatedAt
    .toISOString()
    .slice(0, 19)
    .replace('T', ' ');
  sheet.getCell('A4').value = 'Total de ativos:';
  sheet.getCell('B4').value = params.rows.length;

  ['A2', 'A3', 'A4'].forEach((addr) => {
    sheet.getCell(addr).font = { bold: true };
  });

  const logoPath = params.logoPath?.trim() || null;
  if (logoPath && existsSync(logoPath)) {
    const mime = (params.logoMimeType || '').toLowerCase();
    const ext = mime.includes('png')
      ? 'png'
      : mime.includes('jpg') || mime.includes('jpeg')
        ? 'jpeg'
        : null;
    if (ext) {
      const imageId = workbook.addImage({
        filename: logoPath,
        extension: ext,
      });
      sheet.addImage(imageId, {
        tl: { col: params.multiCompany ? 7.2 : 6.2, row: 0.2 },
        ext: { width: 120, height: 40 },
      });
    }
  }

  const headerRowIndex = 7;
  sheet.getRow(headerRowIndex).values = headers;
  sheet.getRow(headerRowIndex).font = {
    bold: true,
    color: { argb: 'FFFFFFFF' },
  };
  sheet.getRow(headerRowIndex).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0A2540' },
  };
  sheet.getRow(headerRowIndex).alignment = { vertical: 'middle' };
  sheet.getRow(headerRowIndex).height = 20;

  let rowIndex = headerRowIndex + 1;
  for (const row of params.rows) {
    sheet.getRow(rowIndex).values = rowToValues(row, params.multiCompany);
    if (row.overdue) {
      sheet.getRow(rowIndex).getCell(statusCol).font = {
        color: { argb: 'FFB42318' },
        bold: true,
      };
    }
    rowIndex += 1;
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
