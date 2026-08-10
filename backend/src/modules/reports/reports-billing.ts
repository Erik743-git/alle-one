import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';
import type { PrismaService } from '../../prisma/prisma.service';

export type BillingReportFilters = {
  companyId: string;
  start: Date;
  end: Date;
  /** Se true, só linhas com C > B (estouro). */
  onlyExcess?: boolean;
  specialtyIds?: string[];
};

export type BillingReportMultiFilters = Omit<
  BillingReportFilters,
  'companyId'
> & {
  companyIds: string[];
};

export type BillingReportRow = {
  companyName: string;
  specialtyName: string;
  contractTitle: string;
  unlimited: boolean;
  hoursContracted: number; // B
  hoursSpent: number; // C
  balanceHours: number; // D = B - C
  excessAmount: number; // E = D * excessHourPrice (negativo se estourou)
  theoreticalCost: number; // F = C * hourlyRate
  contractValue: number;
  excessHourPrice: number;
  hourlyRate: number;
  amountDue: number;
};

function minutesBetween(initTime: string, endTime: string): number {
  const [ih, im] = initTime.split(':').map((n) => Number(n));
  const [eh, em] = endTime.split(':').map((n) => Number(n));
  if (![ih, im, eh, em].every((n) => Number.isFinite(n)) || ih < 0 || eh < 0) {
    return 0;
  }
  const start = ih * 60 + im;
  const end = eh * 60 + em;
  const diff = end - start;
  return diff > 0 ? diff : 0;
}

function toNumber(value: Prisma.Decimal | number | string | null | undefined) {
  if (value == null) return 0;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function csvEscape(value: string | number) {
  const s = String(value ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function buildBillingReportRowsForCompanies(
  prisma: PrismaService,
  filters: BillingReportMultiFilters,
): Promise<BillingReportRow[]> {
  const ids = [
    ...new Set(filters.companyIds.map((id) => id.trim()).filter(Boolean)),
  ];
  if (!ids.length) {
    throw new BadRequestException('Selecione ao menos uma empresa.');
  }
  const rows: BillingReportRow[] = [];
  for (const companyId of ids) {
    const part = await buildBillingReportRows(prisma, {
      companyId,
      start: filters.start,
      end: filters.end,
      onlyExcess: filters.onlyExcess,
      specialtyIds: filters.specialtyIds,
    });
    rows.push(...part);
  }
  return rows;
}

export async function buildBillingReportRows(
  prisma: PrismaService,
  filters: BillingReportFilters,
): Promise<BillingReportRow[]> {
  const company = await prisma.company.findFirst({
    where: { id: filters.companyId, deletedAt: null },
    select: { id: true, name: true, tifluxClientId: true },
  });
  if (!company) {
    throw new BadRequestException('Empresa não encontrada');
  }

  const contracts = await prisma.contract.findMany({
    where: {
      companyId: company.id,
      deletedAt: null,
      status: 'ACTIVE',
      startDate: { lte: filters.end },
      OR: [{ endDate: null }, { endDate: { gte: filters.start } }],
    },
    include: {
      specialties: {
        include: { specialty: { select: { id: true, name: true } } },
        ...(filters.specialtyIds?.length
          ? { where: { specialtyId: { in: filters.specialtyIds } } }
          : {}),
      },
    },
    orderBy: { title: 'asc' },
  });

  if (!company.tifluxClientId) {
    // Sem vínculo TiFlux: ainda retorna linhas de contrato com C=0
    return contracts.flatMap((contract) =>
      contract.specialties.map((line) => {
        const B = line.unlimited ? 0 : line.monthlyHours;
        const contractValue = toNumber(line.contractValue);
        const excessHourPrice = toNumber(line.excessHourPrice);
        const hourlyRate = !line.unlimited && B > 0 ? contractValue / B : 0;
        return {
          companyName: company.name,
          specialtyName: line.specialty?.name ?? line.specialtyId,
          contractTitle: contract.title,
          unlimited: line.unlimited,
          hoursContracted: B,
          hoursSpent: 0,
          balanceHours: B,
          excessAmount: 0,
          theoreticalCost: 0,
          contractValue,
          excessHourPrice,
          hourlyRate: Number(hourlyRate.toFixed(2)),
          amountDue: contractValue,
        } satisfies BillingReportRow;
      }),
    );
  }

  const tickets = await prisma.portalTicket.findMany({
    where: {
      clientExternalId: company.tifluxClientId,
    },
    select: { ticketNumber: true },
  });
  const ticketNumbers = tickets.map((t) => t.ticketNumber);

  const appointments =
    ticketNumbers.length === 0
      ? []
      : await prisma.portalTicketAppointment.findMany({
          where: {
            ticketNumber: { in: ticketNumbers },
            appointmentDate: {
              gte: filters.start,
              lte: filters.end,
            },
          },
          select: {
            createdBy: true,
            initTime: true,
            endTime: true,
          },
        });

  const creatorIds = [...new Set(appointments.map((a) => a.createdBy))];
  const creators = await prisma.user.findMany({
    where: { id: { in: creatorIds } },
    select: { id: true, specialtyId: true },
  });
  const specialtyByUser = new Map(
    creators.map((u) => [u.id, u.specialtyId ?? null]),
  );

  const spentMinutesBySpecialty = new Map<string, number>();
  for (const appt of appointments) {
    const specialtyId = specialtyByUser.get(appt.createdBy);
    if (!specialtyId) continue;
    if (
      filters.specialtyIds?.length &&
      !filters.specialtyIds.includes(specialtyId)
    ) {
      continue;
    }
    const mins = minutesBetween(appt.initTime, appt.endTime);
    spentMinutesBySpecialty.set(
      specialtyId,
      (spentMinutesBySpecialty.get(specialtyId) ?? 0) + mins,
    );
  }

  const rows: BillingReportRow[] = [];

  for (const contract of contracts) {
    for (const line of contract.specialties) {
      const B = line.unlimited ? 0 : line.monthlyHours;
      const C = (spentMinutesBySpecialty.get(line.specialtyId) ?? 0) / 60;
      const contractValue = toNumber(line.contractValue);
      const excessHourPrice = toNumber(line.excessHourPrice);
      const hourlyRate = !line.unlimited && B > 0 ? contractValue / B : 0;
      const D = line.unlimited ? 0 : B - C;
      const E = line.unlimited ? 0 : D * excessHourPrice;
      const F = C * hourlyRate;
      const amountDue = line.unlimited
        ? contractValue
        : C <= B
          ? contractValue
          : contractValue + Math.abs(E);

      if (filters.onlyExcess && !(C > B && !line.unlimited)) {
        continue;
      }

      rows.push({
        companyName: company.name,
        specialtyName: line.specialty?.name ?? line.specialtyId,
        contractTitle: contract.title,
        unlimited: line.unlimited,
        hoursContracted: B,
        hoursSpent: Number(C.toFixed(2)),
        balanceHours: Number(D.toFixed(2)),
        excessAmount: Number(E.toFixed(2)),
        theoreticalCost: Number(F.toFixed(2)),
        contractValue,
        excessHourPrice,
        hourlyRate: Number(hourlyRate.toFixed(2)),
        amountDue: Number(amountDue.toFixed(2)),
      });
    }
  }

  return rows;
}

export function billingRowsToCsv(rows: BillingReportRow[]): string {
  const header = [
    'Empresa',
    'Contrato',
    'Especialidade',
    'Ilimitado',
    'Horas contratadas (B)',
    'Horas gastas (C)',
    'Saldo horas (D)',
    'Valor excedente (E)',
    'Custo teórico (F)',
    'Valor contrato',
    'Valor hora excedente',
    'Valor hora calculado',
    'A cobrar',
  ];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.companyName,
        r.contractTitle,
        r.specialtyName,
        r.unlimited ? 'sim' : 'não',
        r.hoursContracted,
        r.hoursSpent,
        r.balanceHours,
        r.excessAmount,
        r.theoreticalCost,
        r.contractValue,
        r.excessHourPrice,
        r.hourlyRate,
        r.amountDue,
      ]
        .map(csvEscape)
        .join(','),
    );
  }
  return `${lines.join('\n')}\n`;
}

const BILLING_HEADERS = [
  'Empresa',
  'Contrato',
  'Especialidade',
  'Ilimitado',
  'Horas contratadas (B)',
  'Horas gastas (C)',
  'Saldo horas (D)',
  'Valor excedente (E)',
  'Custo teórico (F)',
  'Valor contrato',
  'Valor hora excedente',
  'Valor hora calculado',
  'A cobrar',
] as const;

const BILLING_COL_COUNT = BILLING_HEADERS.length;
const BILLING_LAST_COL = String.fromCharCode(64 + BILLING_COL_COUNT); // M

function moneyFmt(n: number) {
  return Number.isFinite(n) ? n : 0;
}

export async function billingRowsToXlsx(
  rows: BillingReportRow[],
  meta: { companyName: string; start: Date; end: Date },
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Alle One';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Fechamento', {
    views: [{ state: 'frozen', ySplit: 8 }],
  });

  const widths = [28, 28, 22, 12, 18, 16, 16, 18, 16, 16, 18, 18, 14];
  widths.forEach((w, i) => {
    sheet.getColumn(i + 1).width = w;
  });

  sheet.mergeCells(`A1:${BILLING_LAST_COL}1`);
  const title = sheet.getCell('A1');
  title.value = 'Fechamento / cobrança';
  title.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
  title.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF08182F' },
  };
  title.alignment = { vertical: 'middle', horizontal: 'left' };
  sheet.getRow(1).height = 28;

  sheet.getCell('A2').value = 'Escopo:';
  sheet.getCell('B2').value = meta.companyName;
  sheet.getCell('A3').value = 'Período:';
  sheet.getCell('B3').value =
    `${meta.start.toISOString().slice(0, 10)} a ${meta.end.toISOString().slice(0, 10)}`;
  sheet.getCell('A4').value = 'Linhas:';
  sheet.getCell('B4').value = rows.length;
  sheet.getCell('A5').value = 'Gerado em:';
  sheet.getCell('B5').value = new Date()
    .toISOString()
    .slice(0, 19)
    .replace('T', ' ');

  ['A2', 'A3', 'A4', 'A5'].forEach((addr) => {
    sheet.getCell(addr).font = { bold: true };
  });

  if (rows.length === 0) {
    sheet.mergeCells(`A7:${BILLING_LAST_COL}7`);
    const empty = sheet.getCell('A7');
    empty.value =
      'Nenhuma linha encontrada. Cadastre contratos ativos com especialidades (horas, valor do contrato e hora excedente) para as empresas do período.';
    empty.font = { italic: true, color: { argb: 'FF667085' } };
    empty.alignment = { wrapText: true, vertical: 'middle' };
    sheet.getRow(7).height = 36;

    const outEmpty = await workbook.xlsx.writeBuffer();
    return Buffer.from(outEmpty);
  }

  const headerRowIndex = 8;
  const headerRow = sheet.getRow(headerRowIndex);
  headerRow.values = [...BILLING_HEADERS];
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0A2540' },
  };
  headerRow.alignment = {
    vertical: 'middle',
    wrapText: true,
    horizontal: 'center',
  };
  headerRow.height = 32;

  let rowIndex = headerRowIndex + 1;
  for (const r of rows) {
    const row = sheet.getRow(rowIndex);
    row.values = [
      r.companyName,
      r.contractTitle,
      r.specialtyName,
      r.unlimited ? 'sim' : 'não',
      r.hoursContracted,
      r.hoursSpent,
      r.balanceHours,
      moneyFmt(r.excessAmount),
      moneyFmt(r.theoreticalCost),
      moneyFmt(r.contractValue),
      moneyFmt(r.excessHourPrice),
      moneyFmt(r.hourlyRate),
      moneyFmt(r.amountDue),
    ];
    row.alignment = { vertical: 'middle' };
    row.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };

    // Horas: 0.00
    for (const col of [5, 6, 7]) {
      row.getCell(col).numFmt = '0.00';
      row.getCell(col).alignment = { horizontal: 'right', vertical: 'middle' };
    }
    // Moeda R$
    for (const col of [8, 9, 10, 11, 12, 13]) {
      row.getCell(col).numFmt = '"R$" #,##0.00';
      row.getCell(col).alignment = { horizontal: 'right', vertical: 'middle' };
    }

    if (r.balanceHours < 0 && !r.unlimited) {
      row.getCell(7).font = { color: { argb: 'FFB42318' }, bold: true };
      row.getCell(8).font = { color: { argb: 'FFB42318' } };
    }

    if (rowIndex % 2 === 0) {
      for (let c = 1; c <= BILLING_COL_COUNT; c++) {
        row.getCell(c).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF2F4F7' },
        };
      }
    }

    rowIndex += 1;
  }

  const lastDataRow = rowIndex - 1;
  sheet.autoFilter = {
    from: { row: headerRowIndex, column: 1 },
    to: { row: lastDataRow, column: BILLING_COL_COUNT },
  };

  // Totais
  rowIndex += 1;
  const totalRow = sheet.getRow(rowIndex);
  totalRow.getCell(1).value = 'Totais';
  totalRow.getCell(1).font = { bold: true };
  totalRow.getCell(6).value = {
    formula: `SUM(F${headerRowIndex + 1}:F${lastDataRow})`,
  };
  totalRow.getCell(7).value = {
    formula: `SUM(G${headerRowIndex + 1}:G${lastDataRow})`,
  };
  totalRow.getCell(8).value = {
    formula: `SUM(H${headerRowIndex + 1}:H${lastDataRow})`,
  };
  totalRow.getCell(9).value = {
    formula: `SUM(I${headerRowIndex + 1}:I${lastDataRow})`,
  };
  totalRow.getCell(10).value = {
    formula: `SUM(J${headerRowIndex + 1}:J${lastDataRow})`,
  };
  totalRow.getCell(13).value = {
    formula: `SUM(M${headerRowIndex + 1}:M${lastDataRow})`,
  };
  for (const col of [6, 7]) {
    totalRow.getCell(col).numFmt = '0.00';
    totalRow.getCell(col).font = { bold: true };
  }
  for (const col of [8, 9, 10, 13]) {
    totalRow.getCell(col).numFmt = '"R$" #,##0.00';
    totalRow.getCell(col).font = { bold: true };
  }
  totalRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE8EEF5' },
  };

  const out = await workbook.xlsx.writeBuffer();
  return Buffer.from(out);
}
