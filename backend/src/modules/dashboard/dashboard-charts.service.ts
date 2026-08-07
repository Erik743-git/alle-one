import { Injectable, Logger } from '@nestjs/common';
import { TifluxService } from '../tiflux/tiflux.service';
import { buildTifluxDateRange } from './dashboard-date.utils';

export type DashboardChartTicketsFilters = {
  startDate: Date;
  endDate: Date;
  tifluxClientId: number | null;
};

export type DashboardChartTicketsPage = {
  tickets: Array<Record<string, unknown>>;
  totalItems: number;
  openCount: number;
};

@Injectable()
export class DashboardChartsService {
  private readonly logger = new Logger(DashboardChartsService.name);
  private readonly allowRuntimeTifluxApi =
    process.env.TIFLUX_RUNTIME_API === 'true';
  readonly chartTicketsLimit = 200;

  constructor(private readonly tifluxService: TifluxService) {}

  private devDebug(...args: unknown[]): void {
    if (process.env.NODE_ENV === 'production') return;
    const line = args
      .map((value) => {
        if (typeof value === 'string') return value;
        try {
          return JSON.stringify(value);
        } catch {
          return String(value);
        }
      })
      .join(' | ');
    this.logger.debug(line);
  }

  async fetchTicketsForCharts(
    filters: DashboardChartTicketsFilters,
  ): Promise<Array<Record<string, unknown>>> {
    if (filters.tifluxClientId === null) {
      this.devDebug(
        'fetchTicketsForCharts: tifluxClientId nulo, retornando []',
      );
      return [];
    }

    const { startISO, endISO } = buildTifluxDateRange(
      filters.startDate,
      filters.endDate,
    );

    this.devDebug('==================================================');
    this.devDebug('fetchTicketsForCharts');
    this.devDebug('clientId:', filters.tifluxClientId);
    this.devDebug('startISO:', startISO);
    this.devDebug('endISO:', endISO);
    this.devDebug('limit:', this.chartTicketsLimit);
    this.devDebug('==================================================');

    if (!this.allowRuntimeTifluxApi) {
      return [];
    }

    try {
      const tickets = await this.tifluxService.getTickets({
        filter_by: 'all',
        client_ids: [filters.tifluxClientId],
        date_type: 'created_at',
        start_datetime: startISO,
        end_datetime: endISO,
        limit: this.chartTicketsLimit,
        offset: 1,
      });

      this.devDebug(
        'fetchTicketsForCharts retorno:',
        (tickets as Array<Record<string, unknown>>).map((ticket) => ({
          ticket_number: ticket.ticket_number,
          title: ticket.title,
          created_at: ticket.created_at,
          client: ticket.client,
          desk: ticket.desk,
        })),
      );

      return tickets as Array<Record<string, unknown>>;
    } catch (error) {
      this.logger.warn(
        `Falha ao buscar tickets para gráficos (clientId=${filters.tifluxClientId}): ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  async fetchTicketsPage(params: {
    tifluxClientId: number;
    startISO: string;
    endISO: string;
    limit?: number;
  }): Promise<DashboardChartTicketsPage> {
    const limit = params.limit ?? this.chartTicketsLimit;
    const tifluxListParams = {
      filter_by: 'all' as const,
      client_ids: [params.tifluxClientId],
      date_type: 'created_at' as const,
      start_datetime: params.startISO,
      end_datetime: params.endISO,
      limit,
      offset: 1,
    };

    const [openCount, allPage] = await Promise.all([
      this.tifluxService.getTicketsTotalItems({
        filter_by: 'open',
        client_ids: [params.tifluxClientId],
        date_type: 'created_at',
        start_datetime: params.startISO,
        end_datetime: params.endISO,
      }),
      this.tifluxService.getTicketsWithTotal(tifluxListParams),
    ]);

    return {
      tickets: (allPage.tickets ?? []) as Array<Record<string, unknown>>,
      totalItems: Number(allPage.totalItems ?? 0) || 0,
      openCount: Number(openCount ?? 0) || 0,
    };
  }
}
