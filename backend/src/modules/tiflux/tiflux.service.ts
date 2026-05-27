import {
  BadGatewayException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';

type TifluxApiError = {
  message?: string;
  error?: string;
  statusCode?: number;
  detail?: unknown;
  error_code?: number;
};

type TifluxClient = {
  id: number | string;
  name?: string;
  social_name?: string;
  social_revenue?: string;
  active?: boolean;
  [key: string]: unknown;
};

type TifluxUserType = 'client' | 'attendant' | 'admin';

type TifluxUser = {
  id: number;
  _type: TifluxUserType | null;
  active: boolean;
  email: string;
  gauth_enabled: boolean;
  last_login_at: string | null;
  name: string;
  technical_group_id: number | null;
  [key: string]: unknown;
};

type TifluxTicket = {
  ticket_number: number;
  title?: string;
  created_at?: string;
  updated_at?: string;
  is_closed?: boolean;
  client?: {
    id: number;
    name: string;
  } | null;
  desk?: {
    id: number;
    name: string;
  } | null;
  priority?: {
    id: number;
    name: string;
  } | null;
  status?: {
    id: number;
    name: string;
  } | null;
  stage?: {
    id: number;
    name: string;
  } | null;
  responsible?: {
    id: number;
    name: string;
  } | null;
  requestor?: {
    id?: number | null;
    email?: string | null;
    name?: string | null;
    ramal?: string | null;
    telephone?: string | null;
  } | null;
  sla_info?: {
    attend_expiration?: string | null;
    attend_sla?: boolean | null;
    attend_sla_solution?: boolean | null;
    solve_expiration?: string | null;
    solved_in_time?: boolean | null;
    stage_expiration?: string | null;
    stopped?: boolean | null;
  } | null;
  [key: string]: unknown;
};

type TifluxAppointment = {
  id: number;
  date: string;
  description?: string;
  init_time?: string;
  end_time?: string;
  client?: {
    id: number;
    name: string;
  } | null;
  user?: {
    id: number;
    name: string;
  } | null;
  valorization?: unknown;
  [key: string]: unknown;
};

function isTifluxApiError(value: unknown): value is TifluxApiError {
  if (!value || typeof value !== 'object') {
    return false;
  }

  return (
    'message' in value ||
    'error' in value ||
    'statusCode' in value ||
    'detail' in value ||
    'error_code' in value
  );
}

/** Parâmetros de query da listagem `/tickets` (TiFlux API v2). */
export type TifluxTicketsListFilters = {
  offset?: number;
  limit?: number;
  filter_by?: 'open' | 'closed' | 'all';
  desk_ids?: number[];
  client_ids?: number[];
  responsible_ids?: number[];
  status_id?: number;
  priority_ids?: number[];
  services_catalogs_item_ids?: number[];
  stage_ids?: number[];
  requestor_ids?: number[];
  requestor_email?: string;
  include_filled_entity?: boolean;
  has_jira_issue?: boolean;
  jira_key?: string;
  created_by_way_of?: number;
  search?: string;
  date_type?: 'created_at' | 'solved_in_time';
  start_datetime?: string;
  end_datetime?: string;
  update_start_datetime?: string;
  update_end_datetime?: string;
};

@Injectable()
export class TifluxService {
  private readonly logger = new Logger(TifluxService.name);
  private lastTotalItems: number | null = null;
  private readonly baseUrl: string =
    process.env.TIFLUX_API_URL ?? 'https://api.tiflux.com/api/v2';
  private readonly token: string = process.env.TIFLUX_TOKEN ?? '';
  private readonly requestTimeoutMs = Number(
    process.env.TIFLUX_TIMEOUT_MS ?? 12000,
  );
  private readonly maxRetries = (() => {
    const n = Number(process.env.TIFLUX_MAX_RETRIES);
    if (Number.isFinite(n)) {
      return Math.min(Math.max(Math.trunc(n), 2), 12);
    }
    return 6;
  })();
  private readonly minRequestIntervalMs = (() => {
    const n = Number(process.env.TIFLUX_MIN_REQUEST_INTERVAL_MS);
    if (Number.isFinite(n)) {
      return Math.min(Math.max(Math.trunc(n), 300), 10_000);
    }
    return 1100;
  })();

  private queue: Promise<void> = Promise.resolve();
  private lastRequestAt = 0;
  private pausedUntil = 0;

  private readonly cacheEnabled =
    process.env.EXTERNAL_API_CACHE_ENABLED !== 'false';
  private readonly cacheDefaultTtlMs = (() => {
    const n = Number(process.env.EXTERNAL_API_CACHE_TTL_MS);
    return Number.isFinite(n) && n >= 5_000 ? Math.trunc(n) : 10 * 60 * 1000;
  })();
  private readonly cacheShortTtlMs = (() => {
    const n = Number(process.env.EXTERNAL_API_CACHE_SHORT_TTL_MS);
    return Number.isFinite(n) && n >= 5_000 ? Math.trunc(n) : 60 * 1000;
  })();
  private readonly cacheLongTtlMs = (() => {
    const n = Number(process.env.EXTERNAL_API_CACHE_LONG_TTL_MS);
    return Number.isFinite(n) && n >= 5_000 ? Math.trunc(n) : 60 * 60 * 1000;
  })();

  constructor(private readonly prisma: PrismaService) {}

  private getHeaders(options?: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    hasBody?: boolean;
  }): Record<string, string> {
    if (!this.token) {
      throw new InternalServerErrorException(
        'TIFLUX_TOKEN não definido no .env',
      );
    }

    const headers: Record<string, string> = {
      Accept: 'application/json',
      Authorization: `Bearer ${this.token}`,
    };

    if (options?.hasBody || (options?.method && options.method !== 'GET')) {
      headers['Content-Type'] = 'application/json';
    }

    return headers;
  }

  private buildUrl(path: string): string {
    const normalizedBase = this.baseUrl.replace(/\/+$/, '');
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;

    return `${normalizedBase}${normalizedPath}`;
  }

  private async getCache<T>(cacheKey: string): Promise<T | null> {
    if (!this.cacheEnabled) return null;

    try {
      const rows = await this.prisma.$queryRaw<
        Array<{ payload: unknown; expires_at: Date }>
      >`
        select payload, expires_at
        from external_api_cache
        where cache_key = ${cacheKey}
        limit 1
      `;
      const row = rows[0];
      if (!row) return null;
      if (row.expires_at.getTime() <= Date.now()) return null;
      return row.payload as T;
    } catch {
      return null;
    }
  }

  private async setCache(cacheKey: string, ttlMs: number, payload: unknown) {
    if (!this.cacheEnabled) return;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + Math.max(5_000, ttlMs));

    try {
      const id = randomUUID();
      // Importante: quando `payload` é um array JS, o Prisma pode inferir `jsonb[]`
      // e o Postgres não permite cast `jsonb[] -> jsonb`. Serializando garante `jsonb`.
      const payloadJson = JSON.stringify(payload ?? null);
      await this.prisma.$executeRaw`
        insert into external_api_cache (id, provider, cache_key, payload, fetched_at, expires_at)
        values (${id}, 'TIFLUX', ${cacheKey}, ${payloadJson}::jsonb, ${now}, ${expiresAt})
        on conflict (cache_key)
        do update set
          provider = excluded.provider,
          payload = excluded.payload,
          fetched_at = excluded.fetched_at,
          expires_at = excluded.expires_at
      `;
    } catch (e) {
      // Não falha a operação por cache.
      this.logger.warn(
        `Falha ao gravar cache do TiFlux (key=${cacheKey}): ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
    }
  }

  private async cachedGet<T>(path: string, ttlMs: number): Promise<T> {
    const cacheKey = `tiflux:get:${path}`;
    const cached = await this.getCache<T>(cacheKey);
    if (cached) return cached;

    const data = await this.request<T>(path, 'GET');
    await this.setCache(cacheKey, ttlMs, data);
    return data;
  }

  private async sleep(ms: number) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private shouldRetryByStatus(statusCode: number) {
    return statusCode === 429 || statusCode >= 500;
  }

  private formatError(data: unknown) {
    if (typeof data === 'string') {
      return data || 'Erro ao consultar o TiFlux.';
    }

    if (isTifluxApiError(data)) {
      const base = data.message || data.error || 'Erro ao consultar o TiFlux.';

      if (
        data.detail &&
        typeof data.detail === 'object' &&
        'error' in data.detail &&
        Array.isArray((data.detail as { error?: unknown }).error)
      ) {
        const errors = (data.detail as { error: unknown[] }).error
          .map((item) => String(item))
          .filter(Boolean);
        if (errors.length) {
          return `${base} (${errors.join(', ')})`;
        }
      }

      return base;
    }

    return 'Erro ao consultar o TiFlux.';
  }

  /**
   * Espaçamento entre chamadas HTTP ao TiFlux (dentro de uma seção exclusiva).
   */
  private async waitForThrottle(): Promise<void> {
    const now = Date.now();

    if (this.pausedUntil > now) {
      await this.sleep(this.pausedUntil - now);
    }

    const elapsed = Date.now() - this.lastRequestAt;
    if (elapsed < this.minRequestIntervalMs) {
      await this.sleep(this.minRequestIntervalMs - elapsed);
    }
  }

  /**
   * Garante uma única “sessão” TiFlux por vez: retries, backoff após 429 e sleeps
   * ficam DENTRO do lock. Antes, o sleep após 429 era fora da fila e duas URLs
   * (ex.: open + all) disparavam em paralelo e pioravam o rate limit.
   */
  private async runExclusive<T>(task: () => Promise<T>): Promise<T> {
    const previous = this.queue;

    let release!: () => void;
    this.queue = new Promise<void>((resolve) => {
      release = resolve;
    });

    await previous;

    try {
      return await task();
    } finally {
      release();
    }
  }

  private parseRetryAfterMs(headers: Headers): number | null {
    const raw = headers.get('Retry-After') ?? headers.get('retry-after');
    if (!raw?.trim()) {
      return null;
    }
    const trimmed = raw.trim();
    const sec = Number(trimmed);
    if (Number.isFinite(sec) && sec >= 0) {
      return Math.min(Math.trunc(sec * 1000), 120_000);
    }
    const when = Date.parse(trimmed);
    if (!Number.isNaN(when)) {
      const wait = when - Date.now();
      return wait > 0 ? Math.min(wait, 120_000) : null;
    }
    return null;
  }

  private getRetryDelayMs(
    attempt: number,
    statusCode?: number,
    headers?: Headers,
  ): number {
    if (statusCode === 429) {
      const fromHeader = headers ? this.parseRetryAfterMs(headers) : null;
      const fallback = 5_000 + attempt * 4_000;
      return Math.min(Math.max(fromHeader ?? fallback, 1_000), 120_000);
    }

    return 1200 * (attempt + 1);
  }

  private buildTicketsPath(filters?: TifluxTicketsListFilters): string {
    const searchParams = new URLSearchParams();

    if (filters?.offset !== undefined) {
      searchParams.set('offset', String(filters.offset));
    }

    if (filters?.limit !== undefined) {
      searchParams.set('limit', String(filters.limit));
    }

    if (filters?.filter_by) {
      searchParams.set('filter_by', filters.filter_by);
    }

    if (filters?.desk_ids?.length) {
      searchParams.set('desk_ids', filters.desk_ids.join(','));
    }

    if (filters?.client_ids?.length) {
      searchParams.set('client_ids', filters.client_ids.join(','));
    }

    if (filters?.responsible_ids?.length) {
      searchParams.set('responsible_ids', filters.responsible_ids.join(','));
    }

    if (filters?.status_id !== undefined) {
      searchParams.set('status_id', String(filters.status_id));
    }

    if (filters?.priority_ids?.length) {
      searchParams.set('priority_ids', filters.priority_ids.join(','));
    }

    if (filters?.services_catalogs_item_ids?.length) {
      searchParams.set(
        'services_catalogs_item_ids',
        filters.services_catalogs_item_ids.join(','),
      );
    }

    if (filters?.stage_ids?.length) {
      searchParams.set('stage_ids', filters.stage_ids.join(','));
    }

    if (filters?.requestor_ids?.length) {
      searchParams.set('requestor_ids', filters.requestor_ids.join(','));
    }

    if (filters?.requestor_email) {
      searchParams.set('requestor_email', filters.requestor_email);
    }

    if (filters?.include_filled_entity !== undefined) {
      searchParams.set(
        'include_filled_entity',
        String(filters.include_filled_entity),
      );
    }

    if (filters?.has_jira_issue !== undefined) {
      searchParams.set('has_jira_issue', String(filters.has_jira_issue));
    }

    if (filters?.jira_key) {
      searchParams.set('jira_key', filters.jira_key);
    }

    if (filters?.created_by_way_of !== undefined) {
      searchParams.set('created_by_way_of', String(filters.created_by_way_of));
    }

    if (filters?.search) {
      searchParams.set('search', filters.search);
    }

    if (filters?.date_type) {
      searchParams.set('date_type', filters.date_type);
    }

    if (filters?.start_datetime) {
      searchParams.set('start_datetime', filters.start_datetime);
    }

    if (filters?.end_datetime) {
      searchParams.set('end_datetime', filters.end_datetime);
    }

    if (filters?.update_start_datetime) {
      searchParams.set('update_start_datetime', filters.update_start_datetime);
    }

    if (filters?.update_end_datetime) {
      searchParams.set('update_end_datetime', filters.update_end_datetime);
    }

    const query = searchParams.toString();
    return query ? `/tickets?${query}` : '/tickets';
  }

  async request<T>(
    path: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    body?: Record<string, unknown>,
  ): Promise<T> {
    if (!this.baseUrl) {
      throw new InternalServerErrorException(
        'TIFLUX_API_URL não definida no .env',
      );
    }

    const url = this.buildUrl(path);
    const headers = this.getHeaders({ method, hasBody: Boolean(body) });

    return this.runExclusive(async () => {
      for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
          controller.abort();
        }, this.requestTimeoutMs);

        try {
          await this.waitForThrottle();

          const response = await fetch(url, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined,
            signal: controller.signal,
          });

          this.lastRequestAt = Date.now();

          const contentType = response.headers.get('content-type') ?? '';
          const isJson = contentType.includes('application/json');
          const data: unknown = isJson
            ? await response.json()
            : await response.text();

          if (response.ok) {
            return data as T;
          }

          const isLastAttempt = attempt === this.maxRetries;

          if (response.status === 429) {
            const retryDelay = this.getRetryDelayMs(
              attempt,
              429,
              response.headers,
            );
            this.pausedUntil = Date.now() + retryDelay;

            if (!isLastAttempt) {
              this.logger.warn(
                `TiFlux rate limit (429): aguardando ${retryDelay}ms (tentativa ${attempt + 1}/${this.maxRetries + 1}) url=${url}`,
              );
              await this.sleep(retryDelay);
              continue;
            }
          }

          if (!isLastAttempt && this.shouldRetryByStatus(response.status)) {
            await this.sleep(this.getRetryDelayMs(attempt, response.status));
            continue;
          }

          this.logger.error(
            `TiFlux respondeu erro status=${response.status} url=${url} body=${JSON.stringify(
              data,
            )}`,
          );

          throw new BadGatewayException(this.formatError(data));
        } catch (error) {
          const isLastAttempt = attempt === this.maxRetries;
          const isAbortError =
            error instanceof Error && error.name === 'AbortError';

          if (!isLastAttempt && isAbortError) {
            await this.sleep(this.getRetryDelayMs(attempt));
            continue;
          }

          if (error instanceof BadGatewayException) {
            throw error;
          }

          if (isAbortError) {
            throw new BadGatewayException(
              `Timeout ao consultar o TiFlux após ${this.requestTimeoutMs}ms.`,
            );
          }

          this.logger.error(
            `Falha de rede ao consultar o TiFlux (url=${url})`,
            error instanceof Error ? error.stack : String(error),
          );
          throw new BadGatewayException('Falha de rede ao consultar o TiFlux.');
        } finally {
          clearTimeout(timeoutId);
        }
      }

      throw new BadGatewayException('Erro ao consultar o TiFlux.');
    });
  }

  private async requestWithMeta<T>(
    path: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    body?: Record<string, unknown>,
  ): Promise<{ data: T; headers: Headers }> {
    if (!this.baseUrl) {
      throw new InternalServerErrorException(
        'TIFLUX_API_URL não definida no .env',
      );
    }

    const url = this.buildUrl(path);
    const headers = this.getHeaders({ method, hasBody: Boolean(body) });

    return this.runExclusive(async () => {
      for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
          controller.abort();
        }, this.requestTimeoutMs);

        try {
          await this.waitForThrottle();

          const response = await fetch(url, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined,
            signal: controller.signal,
          });

          this.lastRequestAt = Date.now();

          const contentType = response.headers.get('content-type') ?? '';
          const isJson = contentType.includes('application/json');
          const parsed: unknown = isJson
            ? await response.json()
            : await response.text();

          if (response.ok) {
            const totalRaw =
              response.headers.get('X-Total-Items') ??
              response.headers.get('x-total-items');
            const parsedTotal = totalRaw ? Number(totalRaw) : Number.NaN;
            this.lastTotalItems = Number.isNaN(parsedTotal)
              ? null
              : parsedTotal;
            return { data: parsed as T, headers: response.headers };
          }

          const isLastAttempt = attempt === this.maxRetries;

          if (response.status === 429) {
            const retryDelay = this.getRetryDelayMs(
              attempt,
              429,
              response.headers,
            );
            this.pausedUntil = Date.now() + retryDelay;

            if (!isLastAttempt) {
              this.logger.warn(
                `TiFlux rate limit (429): aguardando ${retryDelay}ms (tentativa ${attempt + 1}/${this.maxRetries + 1}) url=${url}`,
              );
              await this.sleep(retryDelay);
              continue;
            }
          }

          if (!isLastAttempt && this.shouldRetryByStatus(response.status)) {
            await this.sleep(this.getRetryDelayMs(attempt, response.status));
            continue;
          }

          this.logger.error(
            `TiFlux respondeu erro status=${response.status} url=${url} body=${JSON.stringify(
              parsed,
            )}`,
          );

          throw new BadGatewayException(this.formatError(parsed));
        } catch (error) {
          const isLastAttempt = attempt === this.maxRetries;
          const isAbortError =
            error instanceof Error && error.name === 'AbortError';

          if (!isLastAttempt && isAbortError) {
            await this.sleep(this.getRetryDelayMs(attempt));
            continue;
          }

          if (error instanceof BadGatewayException) {
            throw error;
          }

          if (isAbortError) {
            throw new BadGatewayException(
              `Timeout ao consultar o TiFlux após ${this.requestTimeoutMs}ms.`,
            );
          }

          this.logger.error(
            `Falha de rede ao consultar o TiFlux (url=${url})`,
            error instanceof Error ? error.stack : String(error),
          );
          throw new BadGatewayException('Falha de rede ao consultar o TiFlux.');
        } finally {
          clearTimeout(timeoutId);
        }
      }

      throw new BadGatewayException('Erro ao consultar o TiFlux.');
    });
  }

  async testConnection() {
    const sampleClients = await this.getClients({
      limit: 1,
      offset: 1,
    });

    return {
      ok: true,
      baseUrl: this.baseUrl,
      authType: 'Bearer Token',
      sampleClients: sampleClients.length,
      timestamp: new Date().toISOString(),
    };
  }

  async requestResource(
    path: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    body?: Record<string, unknown>,
  ) {
    return this.request<unknown>(path, method, body);
  }

  getLastTotalItemsHeader() {
    return this.lastTotalItems;
  }

  async requestResourceWithMeta<T>(
    path: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    body?: Record<string, unknown>,
  ): Promise<{ data: T; totalItems: number | null }> {
    const { data } = await this.requestWithMeta<T>(path, method, body);
    return { data, totalItems: this.lastTotalItems };
  }

  async getClients(filters?: {
    active?: boolean;
    name?: string;
    social_revenue?: string;
    limit?: number;
    offset?: number;
  }): Promise<TifluxClient[]> {
    const searchParams = new URLSearchParams();

    if (filters?.active !== undefined) {
      searchParams.set('active', String(filters.active));
    }

    if (filters?.name) {
      searchParams.set('name', filters.name);
    }

    if (filters?.social_revenue) {
      searchParams.set('social_revenue', filters.social_revenue);
    }

    if (filters?.limit !== undefined) {
      searchParams.set('limit', String(filters.limit));
    }

    if (filters?.offset !== undefined) {
      searchParams.set('offset', String(filters.offset));
    }

    const query = searchParams.toString();
    const path = query ? `/clients?${query}` : '/clients';

    return this.cachedGet<TifluxClient[]>(path, this.cacheLongTtlMs);
  }

  async getClientsAll(filters?: {
    active?: boolean;
    name?: string;
    social_revenue?: string;
    limitPerPage?: number;
    maxPages?: number;
  }): Promise<TifluxClient[]> {
    const limit = Math.max(1, Math.min(filters?.limitPerPage ?? 200, 200));
    const maxPages = Math.max(1, filters?.maxPages ?? 50);

    const all: TifluxClient[] = [];
    let page = 1;

    while (page <= maxPages) {
      const pageData = await this.getClients({
        active: filters?.active,
        name: filters?.name,
        social_revenue: filters?.social_revenue,
        limit,
        offset: page,
      });

      if (!Array.isArray(pageData) || pageData.length === 0) {
        break;
      }

      all.push(...pageData);

      if (pageData.length < limit) {
        break;
      }

      page += 1;
    }

    return all;
  }

  async getUsers(filters?: {
    active?: boolean;
    gauth_enabled?: boolean;
    type?: TifluxUserType;
    email?: string;
    name?: string;
    limit?: number;
    offset?: number;
  }): Promise<TifluxUser[]> {
    const searchParams = new URLSearchParams();

    if (filters?.active !== undefined) {
      searchParams.set('active', String(filters.active));
    }

    if (filters?.gauth_enabled !== undefined) {
      searchParams.set('gauth_enabled', String(filters.gauth_enabled));
    }

    if (filters?.type) {
      searchParams.set('type', filters.type);
    }

    if (filters?.email) {
      searchParams.set('email', filters.email);
    }

    if (filters?.name) {
      searchParams.set('name', filters.name);
    }

    if (filters?.limit !== undefined) {
      searchParams.set('limit', String(filters.limit));
    }

    if (filters?.offset !== undefined) {
      searchParams.set('offset', String(filters.offset));
    }

    const query = searchParams.toString();
    const path = query ? `/users?${query}` : '/users';

    return this.cachedGet<TifluxUser[]>(path, this.cacheLongTtlMs);
  }

  async getUsersAll(filters?: {
    active?: boolean;
    type?: TifluxUserType;
    limitPerPage?: number;
    maxPages?: number;
  }): Promise<TifluxUser[]> {
    const limit = Math.max(1, Math.min(filters?.limitPerPage ?? 100, 100));
    const maxPages = Math.max(1, filters?.maxPages ?? 50);

    const all: TifluxUser[] = [];
    let page = 1;

    while (page <= maxPages) {
      const pageData = await this.getUsers({
        active: filters?.active,
        type: filters?.type,
        limit,
        offset: page,
      });

      if (!Array.isArray(pageData) || pageData.length === 0) {
        break;
      }

      all.push(...pageData);

      if (pageData.length < limit) {
        break;
      }

      page += 1;
    }

    return all;
  }

  async getTickets(
    filters?: TifluxTicketsListFilters,
  ): Promise<TifluxTicket[]> {
    const path = this.buildTicketsPath(filters);
    return this.cachedGet<TifluxTicket[]>(path, this.cacheDefaultTtlMs);
  }

  /** Lista + total (`X-Total-Items`) numa única chamada — menos 429. */
  async getTicketsWithTotal(filters?: TifluxTicketsListFilters): Promise<{
    tickets: TifluxTicket[];
    totalItems: number;
  }> {
    const path = this.buildTicketsPath(filters);
    // Para este método, cacheamos apenas a lista (o total vem do header).
    // Se houver cache, devolvemos totalItems = tickets.length como fallback.
    const cached = await this.getCache<TifluxTicket[]>(`tiflux:get:${path}`);
    if (cached) {
      return { tickets: cached, totalItems: cached.length };
    }

    const { data, headers } = await this.requestWithMeta<TifluxTicket[]>(
      path,
      'GET',
    );
    const tickets = Array.isArray(data) ? data : [];
    const totalRaw =
      headers.get('X-Total-Items') ?? headers.get('x-total-items');
    const parsed = totalRaw ? Number(totalRaw) : Number.NaN;
    const totalItems = Number.isNaN(parsed) ? tickets.length : parsed;

    await this.setCache(`tiflux:get:${path}`, this.cacheShortTtlMs, tickets);
    return { tickets, totalItems };
  }

  async getTicketsTotalItems(
    filters?: TifluxTicketsListFilters,
  ): Promise<number> {
    const path = this.buildTicketsPath({
      ...filters,
      limit: 1,
      offset: 1,
    });
    const cached = await this.getCache<number>(`tiflux:total:${path}`);
    if (cached !== null) return cached;
    const { headers } = await this.requestWithMeta<unknown[]>(path, 'GET');
    const totalRaw =
      headers.get('X-Total-Items') ?? headers.get('x-total-items');
    const parsed = totalRaw ? Number(totalRaw) : Number.NaN;
    const total = Number.isNaN(parsed) ? 0 : parsed;
    await this.setCache(`tiflux:total:${path}`, this.cacheShortTtlMs, total);
    return total;
  }

  async getTicketAppointments(
    ticketNumber: number,
    filters?: {
      offset?: number;
      limit?: number;
      user_id?: number;
      start_date?: string;
      end_date?: string;
    },
  ): Promise<TifluxAppointment[]> {
    const searchParams = new URLSearchParams();

    if (filters?.offset !== undefined) {
      searchParams.set('offset', String(filters.offset));
    }

    if (filters?.limit !== undefined) {
      searchParams.set('limit', String(filters.limit));
    }

    if (filters?.user_id !== undefined) {
      searchParams.set('user_id', String(filters.user_id));
    }

    if (filters?.start_date) {
      searchParams.set('start_date', filters.start_date);
    }

    if (filters?.end_date) {
      searchParams.set('end_date', filters.end_date);
    }

    const query = searchParams.toString();
    const path = query
      ? `/tickets/${ticketNumber}/appointments?${query}`
      : `/tickets/${ticketNumber}/appointments`;

    return this.cachedGet<TifluxAppointment[]>(path, this.cacheDefaultTtlMs);
  }

  async getTicketAppointmentsAll(
    ticketNumber: number,
    filters?: {
      user_id?: number;
      start_date?: string;
      end_date?: string;
      limit?: number;
    },
  ): Promise<TifluxAppointment[]> {
    const limit = Math.max(1, Math.min(filters?.limit ?? 200, 200));
    const results: TifluxAppointment[] = [];
    let offset = 1;

    while (true) {
      const page = await this.getTicketAppointments(ticketNumber, {
        offset,
        limit,
        user_id: filters?.user_id,
        start_date: filters?.start_date,
        end_date: filters?.end_date,
      });

      if (!Array.isArray(page) || page.length === 0) {
        break;
      }

      results.push(...page);

      if (page.length < limit) {
        break;
      }

      offset += 1;
    }

    return results;
  }
}
