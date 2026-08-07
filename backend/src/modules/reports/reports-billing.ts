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

export async function billingRowsToXlsx(
  rows: BillingReportRow[],
  meta: { companyName: string; start: Date; end: Date },
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Fechamento');
  sheet.addRow([`Fechamento / cobrança — ${meta.companyName}`]);
  sheet.addRow([
    `Período: ${meta.start.toISOString().slice(0, 10)} a ${meta.end.toISOString().slice(0, 10)}`,
  ]);
  sheet.addRow([]);
  sheet.addRow([
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
  ]);
  for (const r of rows) {
    sheet.addRow([
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
    ]);
  }
  const out = await workbook.xlsx.writeBuffer();
  return Buffer.from(out);
}
