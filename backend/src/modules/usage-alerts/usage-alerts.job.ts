import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { shouldRunScheduledJobs } from '../../common/scheduling/should-run-scheduled-jobs';
import { PrismaService } from '../../prisma/prisma.service';
import { DashboardService } from '../dashboard/dashboard.service';
import { MailService } from '../mail/mail.service';
import { ContractStatus } from '@prisma/client';

@Injectable()
export class UsageAlertsJob {
  private readonly logger = new Logger(UsageAlertsJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dashboard: DashboardService,
    private readonly mail: MailService,
  ) {}

  // 09:00 do dia 15 de cada mês
  @Cron('0 0 9 15 * *')
  async runMonthly(): Promise<void> {
    if (!shouldRunScheduledJobs()) return;
    await this.runForDay(new Date());
  }

  private async runForDay(now: Date): Promise<void> {
    const day = now.getDate();

    const rules = await this.prisma.usageAlertRule.findMany({
      where: { enabled: true, dayOfMonth: day },
      include: {
        company: { select: { id: true, name: true, tifluxClientId: true } },
      },
    });

    if (!rules.length) {
      this.logger.log(`Nenhuma regra para o dia ${day}.`);
      return;
    }

    const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23,
      59,
      59,
      999,
    );

    for (const rule of rules) {
      try {
        const company = rule.company;
        if (!company?.tifluxClientId) {
          this.logger.warn(
            `Empresa ${company?.name ?? rule.companyId} sem tifluxClientId; pulando.`,
          );
          continue;
        }

        const contractedHours = await this.getContractedHours(rule.companyId);
        if (!contractedHours || contractedHours <= 0) {
          this.logger.warn(
            `Empresa ${company.name} sem horas contratadas; pulando.`,
          );
          continue;
        }

        const hours = await this.dashboard.getDashboardHours(
          // Job roda como "admin"
          {
            userId: 'system',
            email: 'system@local',
            role: 'ADMIN',
            companyId: null,
            permissions: [],
          } as any,
          {
            group: 'financeiro',
            companyId: rule.companyId,
            start: startMonth.toISOString(),
            end: endMonth.toISOString(),
          },
        );

        const used = Number(hours?.summary?.totalHoras ?? 0);
        const pct = Math.round((used / contractedHours) * 1000) / 10; // 1 casa

        const recipients = rule.recipients as any;
        const to: string[] = Array.isArray(recipients?.to) ? recipients.to : [];
        const cc: string[] = Array.isArray(recipients?.cc) ? recipients.cc : [];
        const uniqueTo = Array.from(
          new Set(to.map((e) => String(e).trim())),
        ).filter(Boolean);
        const uniqueCc = Array.from(
          new Set(cc.map((e) => String(e).trim())),
        ).filter(Boolean);

        if (!uniqueTo.length) {
          this.logger.warn(`Regra ${rule.id} sem destinatários; pulando.`);
          continue;
        }

        const low = rule.lowThresholdPct ?? null;
        const high = rule.highThresholdPct ?? null;

        const belowLow = typeof low === 'number' ? pct < low : false;
        const aboveHigh = typeof high === 'number' ? pct > high : false;

        if (!belowLow && !aboveHigh) {
          this.logger.log(`Empresa ${company.name}: ${pct}% (ok, sem alerta).`);
          continue;
        }

        const monthLabel = startMonth.toLocaleDateString('pt-BR', {
          month: 'long',
          year: 'numeric',
        });
        const subject = belowLow
          ? `Alerta: baixo consumo (${pct}%) — ${company.name}`
          : `Alerta: alto consumo (${pct}%) — ${company.name}`;

        const text =
          `Empresa: ${company.name}\n` +
          `Período: ${monthLabel}\n` +
          `Horas usadas: ${used}\n` +
          `Horas contratadas: ${contractedHours}\n` +
          `Percentual: ${pct}%\n\n` +
          `Regra: low=${low ?? '-'}% high=${high ?? '-'}%\n`;

        const html = `
          <div style="font-family: Arial, sans-serif; line-height: 1.5;">
            <p><strong>Empresa:</strong> ${company.name}</p>
            <p><strong>Período:</strong> ${monthLabel}</p>
            <p><strong>Horas usadas:</strong> ${used}</p>
            <p><strong>Horas contratadas:</strong> ${contractedHours}</p>
            <p><strong>Percentual:</strong> ${pct}%</p>
            <p style="color:#666;font-size:12px">Regra: low=${low ?? '-'}% high=${high ?? '-'}%</p>
          </div>
        `;

        await this.mail.sendMail({
          to: uniqueCc.length
            ? ([
                { address: uniqueTo[0], name: '' } as any,
                ...uniqueTo.slice(1),
              ] as any)
            : uniqueTo,
          subject,
          text,
          html,
        } as any);

        // MailService atual não tem cc no payload; simplificamos mandando to único.
        // Se quiser CC real, eu ajusto o MailService para aceitar cc/bcc.
        this.logger.log(`Alerta enviado para ${company.name}: ${pct}%`);
      } catch (err: any) {
        this.logger.error(
          `Falha ao processar regra ${rule.id}`,
          err?.stack ?? String(err),
        );
        await this.prisma.usageAlertRule.update({
          where: { id: rule.id },
          data: { updatedAt: new Date() },
        });
      }
    }
  }

  private async getContractedHours(companyId: string): Promise<number> {
    // Soma contratos ativos (não deletados). Ajuste se você quiser "último billing" em vez de monthlyHours.
    const contracts = await this.prisma.contract.findMany({
      where: { companyId, deletedAt: null, status: ContractStatus.ACTIVE },
      select: { monthlyHours: true },
    });
    return contracts.reduce((acc, c) => acc + (c.monthlyHours ?? 0), 0);
  }
}
