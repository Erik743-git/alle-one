import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

export type IntegrationsHealth = {
  tifluxSync: {
    status: 'ok' | 'stale' | 'unknown' | 'unavailable';
    lastTicketUpdate: string | null;
    staleAfterHours: number;
    message?: string;
  };
  outbox: {
    pending: number;
    failed: number;
  };
};

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  constructor(private readonly prisma: PrismaService) {}

  getHello(): string {
    return 'Hello World!';
  }

  async getIntegrationsHealth(): Promise<IntegrationsHealth> {
    const staleAfterHours = Number(process.env.TIFLUX_SYNC_STALE_HOURS ?? 6);
    const tifluxSync = await this.checkTifluxSync(staleAfterHours);
    const outbox = await this.countOutbox();

    return {
      tifluxSync,
      outbox,
    };
  }

  private async checkTifluxSync(
    staleAfterHours: number,
  ): Promise<IntegrationsHealth['tifluxSync']> {
    try {
      const rows = await this.prisma.$queryRaw<
        Array<{ max_updated: Date | null }>
      >`
        SELECT MAX(updated_at) AS max_updated
        FROM tiflux.tickets
      `;
      const maxUpdated = rows[0]?.max_updated ?? null;
      if (!maxUpdated) {
        return {
          status: 'unknown',
          lastTicketUpdate: null,
          staleAfterHours,
          message: 'Nenhum ticket em tiflux.tickets.',
        };
      }

      const ageMs = Date.now() - new Date(maxUpdated).getTime();
      const staleMs = staleAfterHours * 60 * 60 * 1000;
      const iso = new Date(maxUpdated).toISOString();

      if (ageMs > staleMs) {
        return {
          status: 'stale',
          lastTicketUpdate: iso,
          staleAfterHours,
          message: `Sync TiFlux possivelmente parado (última atualização há mais de ${staleAfterHours}h).`,
        };
      }

      return {
        status: 'ok',
        lastTicketUpdate: iso,
        staleAfterHours,
      };
    } catch (err) {
      this.logger.warn(
        `health/integrations tiflux: ${err instanceof Error ? err.message : String(err)}`,
      );
      return {
        status: 'unavailable',
        lastTicketUpdate: null,
        staleAfterHours,
        message: 'Schema tiflux.* indisponível ou sync nunca rodou.',
      };
    }
  }

  private async countOutbox(): Promise<IntegrationsHealth['outbox']> {
    try {
      const [pending, failed] = await Promise.all([
        this.prisma.portalTifluxOutbox.count({
          where: { status: 'PENDING' },
        }),
        this.prisma.portalTifluxOutbox.count({
          where: { status: 'FAILED' },
        }),
      ]);
      return { pending, failed };
    } catch {
      return { pending: 0, failed: 0 };
    }
  }
}
