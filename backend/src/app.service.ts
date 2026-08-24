import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import {
  isTicketsPortalCanonical,
  isTifluxDisconnected,
} from './modules/tickets/tickets-portal.config';

export type IntegrationsHealth = {
  tifluxSync: {
    status: 'ok' | 'stale' | 'unknown' | 'unavailable' | 'disconnected';
    lastTicketUpdate: string | null;
    staleAfterHours: number;
    message?: string;
    source?: 'portal_tickets' | 'tiflux.tickets' | 'disconnected';
  };
  outbox: {
    pending: number;
    failed: number;
  };
  tifluxDisconnected?: boolean;
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
    const disconnected = isTifluxDisconnected();
    const tifluxSync = disconnected
      ? {
          status: 'disconnected' as const,
          lastTicketUpdate: null,
          staleAfterHours,
          message:
            'TiFlux desvinculado (TIFLUX_DISCONNECTED). Sync externo não é exigido.',
          source: 'disconnected' as const,
        }
      : await this.checkTifluxSync(staleAfterHours);
    const outbox = await this.countOutbox();

    return {
      tifluxSync,
      outbox,
      tifluxDisconnected: disconnected,
    };
  }

  private async checkTifluxSync(
    staleAfterHours: number,
  ): Promise<IntegrationsHealth['tifluxSync']> {
    // Portal canônico + sync ligado: frescor do espelho inbound (tiflux.*).
    if (isTicketsPortalCanonical() && !isTifluxDisconnected()) {
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
            message:
              'Espelho tiflux.tickets vazio. Rode alleone-tiflux-sync e o ETL.',
            source: 'tiflux.tickets',
          };
        }
        return this.evaluateFreshness(
          maxUpdated,
          staleAfterHours,
          'tiflux.tickets',
          `Espelho TiFlux parado (última atualização há mais de ${staleAfterHours}h). Verifique alleone-tiflux-sync.`,
        );
      } catch (err) {
        this.logger.warn(
          `health/integrations tiflux mirror: ${err instanceof Error ? err.message : String(err)}`,
        );
        return {
          status: 'unavailable',
          lastTicketUpdate: null,
          staleAfterHours,
          message: 'Schema tiflux.* indisponível ou sync nunca rodou.',
          source: 'tiflux.tickets',
        };
      }
    }

    if (isTicketsPortalCanonical()) {
      return this.checkPortalTicketsFreshness(staleAfterHours);
    }

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
          source: 'tiflux.tickets',
        };
      }

      return this.evaluateFreshness(
        maxUpdated,
        staleAfterHours,
        'tiflux.tickets',
        `Sync TiFlux possivelmente parado (última atualização há mais de ${staleAfterHours}h).`,
      );
    } catch (err) {
      this.logger.warn(
        `health/integrations tiflux: ${err instanceof Error ? err.message : String(err)}`,
      );
      return {
        status: 'unavailable',
        lastTicketUpdate: null,
        staleAfterHours,
        message: 'Schema tiflux.* indisponível ou sync nunca rodou.',
        source: 'tiflux.tickets',
      };
    }
  }

  private async checkPortalTicketsFreshness(
    staleAfterHours: number,
  ): Promise<IntegrationsHealth['tifluxSync']> {
    try {
      const agg = await this.prisma.portalTicket.aggregate({
        _max: { updatedAt: true, updatedAtSource: true },
      });
      const maxUpdated = agg._max.updatedAtSource ?? agg._max.updatedAt ?? null;
      if (!maxUpdated) {
        return {
          status: 'unknown',
          lastTicketUpdate: null,
          staleAfterHours,
          message: 'Nenhum ticket em portal_tickets.',
          source: 'portal_tickets',
        };
      }

      return this.evaluateFreshness(
        maxUpdated,
        staleAfterHours,
        'portal_tickets',
        `Tickets do portal sem atualização há mais de ${staleAfterHours}h.`,
      );
    } catch (err) {
      this.logger.warn(
        `health/integrations portal: ${err instanceof Error ? err.message : String(err)}`,
      );
      return {
        status: 'unavailable',
        lastTicketUpdate: null,
        staleAfterHours,
        message: 'portal_tickets indisponível.',
        source: 'portal_tickets',
      };
    }
  }

  private evaluateFreshness(
    maxUpdated: Date,
    staleAfterHours: number,
    source: 'portal_tickets' | 'tiflux.tickets',
    staleMessage: string,
  ): IntegrationsHealth['tifluxSync'] {
    const ageMs = Date.now() - new Date(maxUpdated).getTime();
    const staleMs = staleAfterHours * 60 * 60 * 1000;
    const iso = new Date(maxUpdated).toISOString();

    if (ageMs > staleMs) {
      return {
        status: 'stale',
        lastTicketUpdate: iso,
        staleAfterHours,
        message: staleMessage,
        source,
      };
    }

    return {
      status: 'ok',
      lastTicketUpdate: iso,
      staleAfterHours,
      source,
    };
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
