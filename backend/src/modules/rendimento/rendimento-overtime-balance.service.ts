import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { resolvePayrollPeriodRange } from './rendimento-payroll-period.helper';

@Injectable()
export class RendimentoOvertimeBalanceService {
  constructor(private readonly prisma: PrismaService) {}

  async getBalanceMinutes(userId: string): Promise<number> {
    const row = await this.prisma.rendimentoOvertimeBalance.findUnique({
      where: { userId },
      select: { minutes: true },
    });
    return row?.minutes ?? 0;
  }

  getNetBalanceMinutes(
    periodOvertimeMinutes: number,
    protectedMinutes: number,
    debitedMinutes: number,
  ): number {
    return (
      Math.trunc(periodOvertimeMinutes) -
      Math.trunc(protectedMinutes) -
      Math.trunc(debitedMinutes)
    );
  }

  getDebitableMinutes(
    periodOvertimeMinutes: number,
    protectedMinutes: number,
    debitedMinutes: number,
  ): number {
    return Math.max(
      0,
      this.getNetBalanceMinutes(
        periodOvertimeMinutes,
        protectedMinutes,
        debitedMinutes,
      ),
    );
  }

  async refreshBalance(
    userId: string,
    periodOvertimeMinutes: number,
    referenceDate: Date,
  ): Promise<number> {
    const payroll = resolvePayrollPeriodRange(referenceDate);
    const protectedMinutes = await this.getProtectedMinutes(
      userId,
      payroll.start,
      payroll.end,
    );
    const debitedMinutes = await this.getDebitedMinutes(
      userId,
      payroll.start,
      payroll.end,
    );
    const available = this.getNetBalanceMinutes(
      periodOvertimeMinutes,
      protectedMinutes,
      debitedMinutes,
    );
    await this.prisma.$executeRawUnsafe(
      `
      INSERT INTO rendimento_overtime_balances (user_id, minutes, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET minutes = $2, updated_at = NOW()
    `,
      userId,
      available,
    );
    return available;
  }

  private async getProtectedMinutes(
    userId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<number> {
    const rows =
      (await this.prisma.$queryRawUnsafe<Array<{ total: number }>>(
        `
        SELECT COALESCE(SUM(minutes), 0)::int AS total
        FROM rendimento_day_events
        WHERE user_id = $1
          AND date_ref BETWEEN $2::date AND $3::date
          AND event_type = 'OVERTIME'
          AND status = 'APPROVED'
          AND debit_protected = true
          AND deleted_at IS NULL
      `,
        userId,
        this.toDateOnlyString(periodStart),
        this.toDateOnlyString(periodEnd),
      )) ?? [];
    return Number(rows[0]?.total) || 0;
  }

  private async getDebitedMinutes(
    userId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<number> {
    const rows =
      (await this.prisma.$queryRawUnsafe<Array<{ total: number }>>(
        `
        SELECT COALESCE(SUM(overtime_minutes), 0)::int AS total
        FROM rendimento_gap_justifications
        WHERE user_id = $1
          AND date_ref BETWEEN $2::date AND $3::date
          AND status = 'APPROVED'
          AND debit_overtime = true
          AND deleted_at IS NULL
      `,
        userId,
        this.toDateOnlyString(periodStart),
        this.toDateOnlyString(periodEnd),
      )) ?? [];
    return Number(rows[0]?.total) || 0;
  }

  private toDateOnlyString(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
