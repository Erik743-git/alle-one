import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class UsageAlertsService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    return this.prisma.usageAlertRule.findMany({
      orderBy: [{ enabled: 'desc' }, { updatedAt: 'desc' }],
      include: { company: { select: { id: true, name: true } } },
    });
  }

  async upsert(data: {
    companyId: string;
    enabled?: boolean;
    dayOfMonth?: number;
    lowThresholdPct?: number | null;
    highThresholdPct?: number | null;
    to: string[];
    cc?: string[];
  }) {
    const company = await this.prisma.company.findFirst({
      where: { id: data.companyId, deletedAt: null },
      select: { id: true },
    });
    if (!company) throw new NotFoundException('Empresa não encontrada');

    const recipients = {
      to: Array.from(new Set(data.to.map((e) => e.trim()))).filter(Boolean),
      cc: Array.from(new Set((data.cc ?? []).map((e) => e.trim()))).filter(
        Boolean,
      ),
    };

    const existing = await this.prisma.usageAlertRule.findFirst({
      where: { companyId: data.companyId },
      select: { id: true },
    });

    if (existing) {
      return this.prisma.usageAlertRule.update({
        where: { id: existing.id },
        data: {
          enabled: data.enabled ?? undefined,
          dayOfMonth: data.dayOfMonth ?? undefined,
          lowThresholdPct: data.lowThresholdPct ?? undefined,
          highThresholdPct: data.highThresholdPct ?? undefined,
          recipients,
        },
      });
    }

    return this.prisma.usageAlertRule.create({
      data: {
        companyId: data.companyId,
        enabled: data.enabled ?? true,
        dayOfMonth: data.dayOfMonth ?? 15,
        lowThresholdPct: data.lowThresholdPct ?? null,
        highThresholdPct: data.highThresholdPct ?? null,
        recipients,
      },
    });
  }
}
