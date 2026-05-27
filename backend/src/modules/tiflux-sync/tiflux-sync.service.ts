import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { TifluxService } from '../tiflux/tiflux.service';

type SyncStateRow = {
  entity_name: string;
  last_source_updated_at: Date | null;
};

type TifluxSyncTicket = {
  ticket_number?: number;
  title?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  is_closed?: boolean | null;
  created_by_way_of?: string | number | null;
  client?: { id?: number | null; name?: string | null } | null;
  desk?: { id?: number | null; name?: string | null } | null;
  priority?: { id?: number | null; name?: string | null } | null;
  status?: { id?: number | null; name?: string | null } | null;
  stage?: { id?: number | null; name?: string | null } | null;
  responsible?: { id?: number | null; name?: string | null } | null;
  requestor?: {
    id?: number | null;
    email?: string | null;
    name?: string | null;
    ramal?: string | null;
    telephone?: string | null;
  } | null;
  services_catalog?: unknown;
  sla_info?: unknown;
  [key: string]: unknown;
};

type TifluxSyncClient = {
  id?: number | string;
  name?: string | null;
  social_name?: string | null;
  social_revenue?: string | null;
  active?: boolean | null;
  [key: string]: unknown;
};

type TifluxSyncUser = {
  id?: number;
  name?: string | null;
  email?: string | null;
  _type?: string | null;
  active?: boolean | null;
  gauth_enabled?: boolean | null;
  [key: string]: unknown;
};

type TifluxSyncAppointment = {
  id?: number;
  date?: string | null;
  description?: string | null;
  init_time?: string | null;
  end_time?: string | null;
  client?: { id?: number | null; name?: string | null } | null;
  user?: { id?: number | null; name?: string | null } | null;
  valorization?: unknown;
  locations?: unknown;
  [key: string]: unknown;
};

@Injectable()
export class TifluxSyncService implements OnModuleInit {
  private readonly logger = new Logger(TifluxSyncService.name);
  private running = false;
  private ensureSchemaPromise: Promise<void> | null = null;

  private readonly enabled = process.env.TIFLUX_SYNC_ENABLED !== 'false';
  private readonly runOnStartup = process.env.TIFLUX_SYNC_STARTUP !== 'false';
  private readonly pageLimit = Math.max(
    1,
    Math.min(Number(process.env.TIFLUX_SYNC_PAGE_LIMIT ?? 200), 200),
  );
  private readonly maxPagesPerEntity = Math.max(
    1,
    Number(process.env.TIFLUX_SYNC_MAX_PAGES ?? 100),
  );
  private readonly maxTicketsPerAppointmentsRun = Math.max(
    1,
    Number(process.env.TIFLUX_SYNC_APPOINTMENTS_MAX_TICKETS_PER_RUN ?? 200),
  );
  private readonly maxAppointmentPagesPerTicket = Math.max(
    1,
    Number(process.env.TIFLUX_SYNC_APPOINTMENTS_MAX_PAGES ?? 50),
  );
  private readonly openAppointmentsResyncHours = (() => {
    const value = Number(
      process.env.TIFLUX_SYNC_OPEN_APPOINTMENTS_RESYNC_HOURS ?? 24,
    );
    if (!Number.isFinite(value) || value <= 0) return 0;
    return Math.min(Math.trunc(value), 24 * 30);
  })();

  constructor(
    private readonly prisma: PrismaService,
    private readonly tifluxService: TifluxService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.enabled) return;
    await this.ensureSchema();
    if (!this.runOnStartup) return;
    setTimeout(() => {
      void this.runCycle();
    }, 1500);
  }

  @Cron('0 */5 * * * *')
  async onCron(): Promise<void> {
    if (!this.enabled) return;
    await this.runCycle();
  }

  private async runCycle(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.ensureSchema();
      await this.syncClients();
      await this.syncUsers();
      await this.syncTickets();
      await this.syncTicketAppointments();
    } catch (error) {
      this.logger.error(
        'Falha no ciclo de sincronização TiFlux.',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.running = false;
    }
  }

  private async ensureSchema(): Promise<void> {
    if (this.ensureSchemaPromise) {
      await this.ensureSchemaPromise;
      return;
    }

    this.ensureSchemaPromise = (async () => {
      await this.prisma.$executeRawUnsafe(
        `CREATE EXTENSION IF NOT EXISTS pgcrypto;`,
      );
      await this.prisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS tiflux;`);

      await this.prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS tiflux.clients (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          external_id INTEGER NOT NULL UNIQUE,
          name VARCHAR(255),
          social VARCHAR(255),
          social_revenue VARCHAR(50),
          status BOOLEAN,
          raw_json JSONB,
          synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `);

      await this.prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS tiflux.users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          external_id INTEGER NOT NULL UNIQUE,
          name VARCHAR(255),
          email VARCHAR(255),
          type VARCHAR(30),
          active BOOLEAN,
          gauth_enabled BOOLEAN,
          raw_json JSONB,
          synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `);

      await this.prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS tiflux.tickets (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          ticket_number INTEGER NOT NULL UNIQUE,
          client_external_id INTEGER,
          client_name VARCHAR(255),
          desk_external_id INTEGER,
          desk_name VARCHAR(255),
          created_at_source TIMESTAMPTZ,
          created_by_way_of VARCHAR(100),
          is_closed BOOLEAN,
          priority_external_id INTEGER,
          priority_name VARCHAR(100),
          requestor_external_id INTEGER,
          requestor_email VARCHAR(255),
          requestor_name VARCHAR(255),
          requestor_ramal VARCHAR(50),
          requestor_telephone VARCHAR(50),
          responsible_external_id INTEGER,
          responsible_name VARCHAR(255),
          services_catalog_raw JSONB,
          sla_info_raw JSONB,
          stage_external_id INTEGER,
          stage_name VARCHAR(100),
          status_external_id INTEGER,
          status_name VARCHAR(100),
          title TEXT,
          updated_at_source TIMESTAMPTZ,
          raw_json JSONB,
          appointments_synced_at TIMESTAMPTZ,
          synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `);

      await this.prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS tiflux.ticket_appointments (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          ticket_number INTEGER NOT NULL,
          external_id INTEGER NOT NULL,
          client_external_id INTEGER,
          client_name VARCHAR(255),
          appointment_date DATE,
          description TEXT,
          init_time TIME,
          end_time TIME,
          user_external_id INTEGER,
          user_name VARCHAR(255),
          valorization_raw JSONB,
          locations_raw JSONB,
          raw_json JSONB,
          synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          CONSTRAINT uq_tiflux_ticket_appointments UNIQUE (ticket_number, external_id)
        );
      `);

      await this.prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_tiflux_ticket_appointments_ticket_number
        ON tiflux.ticket_appointments (ticket_number);
      `);

      await this.prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_tiflux_ticket_appointments_user_date
        ON tiflux.ticket_appointments (user_external_id, appointment_date);
      `);

      await this.prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS tiflux.sync_state (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          entity_name VARCHAR(100) NOT NULL UNIQUE,
          last_success_at TIMESTAMPTZ,
          last_source_updated_at TIMESTAMPTZ,
          last_page INTEGER,
          status VARCHAR(30),
          error_message TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `);
    })();

    try {
      await this.ensureSchemaPromise;
    } finally {
      this.ensureSchemaPromise = null;
    }
  }

  private buildPath(base: string, params: Record<string, unknown>): string {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === '') continue;
      search.set(key, String(value));
    }
    const query = search.toString();
    return query ? `${base}?${query}` : base;
  }

  private async upsertState(params: {
    entityName: string;
    status: 'running' | 'ok' | 'error';
    lastPage?: number | null;
    lastSourceUpdatedAt?: Date | null;
    errorMessage?: string | null;
  }) {
    await this.prisma.$executeRaw`
      INSERT INTO tiflux.sync_state (
        id,
        entity_name,
        last_success_at,
        last_source_updated_at,
        last_page,
        status,
        error_message,
        created_at,
        updated_at
      )
      VALUES (
        gen_random_uuid(),
        ${params.entityName},
        ${params.status === 'ok' ? new Date() : null},
        ${params.lastSourceUpdatedAt ?? null},
        ${params.lastPage ?? null},
        ${params.status},
        ${params.errorMessage ?? null},
        now(),
        now()
      )
      ON CONFLICT (entity_name) DO UPDATE SET
        last_success_at = CASE
          WHEN EXCLUDED.status = 'ok' THEN EXCLUDED.last_success_at
          ELSE tiflux.sync_state.last_success_at
        END,
        last_source_updated_at = COALESCE(EXCLUDED.last_source_updated_at, tiflux.sync_state.last_source_updated_at),
        last_page = EXCLUDED.last_page,
        status = EXCLUDED.status,
        error_message = EXCLUDED.error_message,
        updated_at = now();
    `;
  }

  private async readState(entityName: string): Promise<SyncStateRow | null> {
    const rows = await this.prisma.$queryRaw<SyncStateRow[]>`
      SELECT entity_name, last_source_updated_at
      FROM tiflux.sync_state
      WHERE entity_name = ${entityName}
      LIMIT 1
    `;
    return rows[0] ?? null;
  }

  private async syncClients(): Promise<void> {
    const entity = 'clients';
    await this.upsertState({ entityName: entity, status: 'running', lastPage: 1 });

    try {
      for (let page = 1; page <= this.maxPagesPerEntity; page += 1) {
        const path = this.buildPath('/clients', {
          limit: this.pageLimit,
          offset: page,
        });
        const { data } = await this.tifluxService.requestResourceWithMeta<
          TifluxSyncClient[]
        >(path);
        const items = Array.isArray(data) ? data : [];
        if (items.length === 0) break;

        for (const c of items) {
          const externalId = Number(c?.id);
          if (!Number.isFinite(externalId) || externalId <= 0) continue;
          await this.prisma.$executeRaw`
            INSERT INTO tiflux.clients (
              id, external_id, name, social, social_revenue, status, raw_json, synced_at, created_at, updated_at
            )
            VALUES (
              gen_random_uuid(),
              ${externalId},
              ${String(c?.name ?? '').trim() || null},
              ${String(c?.social_name ?? '').trim() || null},
              ${String(c?.social_revenue ?? '').trim() || null},
              ${typeof c?.active === 'boolean' ? c.active : null},
              ${JSON.stringify(c ?? null)}::jsonb,
              now(),
              now(),
              now()
            )
            ON CONFLICT (external_id) DO UPDATE SET
              name = EXCLUDED.name,
              social = EXCLUDED.social,
              social_revenue = EXCLUDED.social_revenue,
              status = EXCLUDED.status,
              raw_json = EXCLUDED.raw_json,
              synced_at = now(),
              updated_at = now();
          `;
        }

        await this.upsertState({
          entityName: entity,
          status: 'running',
          lastPage: page,
        });

        if (items.length < this.pageLimit) break;
      }

      await this.upsertState({
        entityName: entity,
        status: 'ok',
        lastPage: 1,
      });
    } catch (error) {
      await this.upsertState({
        entityName: entity,
        status: 'error',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async syncUsers(): Promise<void> {
    const entity = 'users';
    await this.upsertState({ entityName: entity, status: 'running', lastPage: 1 });

    try {
      for (let page = 1; page <= this.maxPagesPerEntity; page += 1) {
        const path = this.buildPath('/users', {
          limit: this.pageLimit,
          offset: page,
        });
        const { data } = await this.tifluxService.requestResourceWithMeta<
          TifluxSyncUser[]
        >(path);
        const items = Array.isArray(data) ? data : [];
        if (items.length === 0) break;

        for (const u of items) {
          const externalId = Number(u?.id);
          if (!Number.isFinite(externalId) || externalId <= 0) continue;
          const normalizedEmail =
            String(u?.email ?? '')
              .trim()
              .toLowerCase() || null;

          await this.prisma.$executeRaw`
            INSERT INTO tiflux.users (
              id, external_id, name, email, type, active, gauth_enabled, raw_json, synced_at, created_at, updated_at
            )
            VALUES (
              gen_random_uuid(),
              ${externalId},
              ${String(u?.name ?? '').trim() || null},
              ${normalizedEmail},
              ${String(u?._type ?? '').trim() || null},
              ${typeof u?.active === 'boolean' ? u.active : null},
              ${typeof u?.gauth_enabled === 'boolean' ? u.gauth_enabled : null},
              ${JSON.stringify(u ?? null)}::jsonb,
              now(),
              now(),
              now()
            )
            ON CONFLICT (external_id) DO UPDATE SET
              name = EXCLUDED.name,
              email = EXCLUDED.email,
              type = EXCLUDED.type,
              active = EXCLUDED.active,
              gauth_enabled = EXCLUDED.gauth_enabled,
              raw_json = EXCLUDED.raw_json,
              synced_at = now(),
              updated_at = now();
          `;
        }

        await this.upsertState({
          entityName: entity,
          status: 'running',
          lastPage: page,
        });

        if (items.length < this.pageLimit) break;
      }

      await this.upsertState({
        entityName: entity,
        status: 'ok',
        lastPage: 1,
      });
    } catch (error) {
      await this.upsertState({
        entityName: entity,
        status: 'error',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private toValidDateOrNull(value: unknown): Date | null {
    if (!value) return null;
    const parsed = new Date(String(value));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private async syncTickets(): Promise<void> {
    const entity = 'tickets';
    const state = await this.readState(entity);
    const incrementalStart = state?.last_source_updated_at ?? null;
    const incrementalEnd = new Date();
    let maxSourceDate = incrementalStart;

    await this.upsertState({ entityName: entity, status: 'running', lastPage: 1 });

    try {
      for (let page = 1; page <= this.maxPagesPerEntity; page += 1) {
        const path = this.buildPath('/tickets', {
          filter_by: 'all',
          limit: this.pageLimit,
          offset: page,
          update_start_datetime: incrementalStart?.toISOString(),
          update_end_datetime: incrementalStart ? incrementalEnd.toISOString() : undefined,
        });
        const { data } = await this.tifluxService.requestResourceWithMeta<
          TifluxSyncTicket[]
        >(path);
        const items = Array.isArray(data) ? data : [];
        if (items.length === 0) break;

        for (const t of items) {
          const ticketNumber = Number(t?.ticket_number);
          if (!Number.isFinite(ticketNumber) || ticketNumber <= 0) continue;

          const createdAtSource = this.toValidDateOrNull(t?.created_at);
          const updatedAtSource = this.toValidDateOrNull(t?.updated_at);
          const sourceDate = updatedAtSource ?? createdAtSource;
          if (
            sourceDate &&
            (!maxSourceDate || sourceDate.getTime() > maxSourceDate.getTime())
          ) {
            maxSourceDate = sourceDate;
          }

          await this.prisma.$executeRaw`
            INSERT INTO tiflux.tickets (
              id,
              ticket_number,
              client_external_id,
              client_name,
              desk_external_id,
              desk_name,
              created_at_source,
              created_by_way_of,
              is_closed,
              priority_external_id,
              priority_name,
              requestor_external_id,
              requestor_email,
              requestor_name,
              requestor_ramal,
              requestor_telephone,
              responsible_external_id,
              responsible_name,
              services_catalog_raw,
              sla_info_raw,
              stage_external_id,
              stage_name,
              status_external_id,
              status_name,
              title,
              updated_at_source,
              raw_json,
              synced_at,
              created_at,
              updated_at
            )
            VALUES (
              gen_random_uuid(),
              ${ticketNumber},
              ${Number(t?.client?.id ?? NaN) || null},
              ${String(t?.client?.name ?? '').trim() || null},
              ${Number(t?.desk?.id ?? NaN) || null},
              ${String(t?.desk?.name ?? '').trim() || null},
              ${createdAtSource},
              ${String(t?.created_by_way_of ?? '').trim() || null},
              ${typeof t?.is_closed === 'boolean' ? t.is_closed : null},
              ${Number(t?.priority?.id ?? NaN) || null},
              ${String(t?.priority?.name ?? '').trim() || null},
              ${Number(t?.requestor?.id ?? NaN) || null},
              ${String(t?.requestor?.email ?? '').trim().toLowerCase() || null},
              ${String(t?.requestor?.name ?? '').trim() || null},
              ${String(t?.requestor?.ramal ?? '').trim() || null},
              ${String(t?.requestor?.telephone ?? '').trim() || null},
              ${Number(t?.responsible?.id ?? NaN) || null},
              ${String(t?.responsible?.name ?? '').trim() || null},
              ${JSON.stringify(t?.services_catalog ?? null)}::jsonb,
              ${JSON.stringify(t?.sla_info ?? null)}::jsonb,
              ${Number(t?.stage?.id ?? NaN) || null},
              ${String(t?.stage?.name ?? '').trim() || null},
              ${Number(t?.status?.id ?? NaN) || null},
              ${String(t?.status?.name ?? '').trim() || null},
              ${String(t?.title ?? '').trim() || null},
              ${updatedAtSource},
              ${JSON.stringify(t ?? null)}::jsonb,
              now(),
              now(),
              now()
            )
            ON CONFLICT (ticket_number) DO UPDATE SET
              client_external_id = EXCLUDED.client_external_id,
              client_name = EXCLUDED.client_name,
              desk_external_id = EXCLUDED.desk_external_id,
              desk_name = EXCLUDED.desk_name,
              created_at_source = EXCLUDED.created_at_source,
              created_by_way_of = EXCLUDED.created_by_way_of,
              is_closed = EXCLUDED.is_closed,
              priority_external_id = EXCLUDED.priority_external_id,
              priority_name = EXCLUDED.priority_name,
              requestor_external_id = EXCLUDED.requestor_external_id,
              requestor_email = EXCLUDED.requestor_email,
              requestor_name = EXCLUDED.requestor_name,
              requestor_ramal = EXCLUDED.requestor_ramal,
              requestor_telephone = EXCLUDED.requestor_telephone,
              responsible_external_id = EXCLUDED.responsible_external_id,
              responsible_name = EXCLUDED.responsible_name,
              services_catalog_raw = EXCLUDED.services_catalog_raw,
              sla_info_raw = EXCLUDED.sla_info_raw,
              stage_external_id = EXCLUDED.stage_external_id,
              stage_name = EXCLUDED.stage_name,
              status_external_id = EXCLUDED.status_external_id,
              status_name = EXCLUDED.status_name,
              title = EXCLUDED.title,
              updated_at_source = EXCLUDED.updated_at_source,
              raw_json = EXCLUDED.raw_json,
              synced_at = now(),
              updated_at = now();
          `;
        }

        await this.upsertState({
          entityName: entity,
          status: 'running',
          lastPage: page,
          lastSourceUpdatedAt: maxSourceDate,
        });

        if (items.length < this.pageLimit) break;
      }

      await this.upsertState({
        entityName: entity,
        status: 'ok',
        lastPage: 1,
        lastSourceUpdatedAt: maxSourceDate,
      });
    } catch (error) {
      await this.upsertState({
        entityName: entity,
        status: 'error',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async listTicketsNeedingAppointmentsSync(): Promise<number[]> {
    // Abertos: sempre entram na fila (apontamentos mudam com frequência).
    // Fechados: só quando nunca sincronizou ou o ticket mudou na origem.
    const rows = await this.prisma.$queryRaw<Array<{ ticket_number: number }>>`
      SELECT t.ticket_number
      FROM tiflux.tickets t
      WHERE (
        COALESCE(t.is_closed, false) = false
        OR (
          COALESCE(t.is_closed, false) = true
          AND (
            t.appointments_synced_at IS NULL
            OR t.appointments_synced_at < COALESCE(
              t.updated_at_source,
              t.created_at_source,
              t.appointments_synced_at
            )
          )
        )
      )
      ORDER BY
        CASE WHEN COALESCE(t.is_closed, false) = false THEN 0 ELSE 1 END ASC,
        CASE
          WHEN COALESCE(t.is_closed, false) = false
            AND t.appointments_synced_at IS NOT NULL
            AND t.appointments_synced_at < COALESCE(t.updated_at_source, t.created_at_source, t.appointments_synced_at)
          THEN 0
          WHEN COALESCE(t.is_closed, false) = false THEN 1
          ELSE 2
        END ASC,
        t.appointments_synced_at ASC NULLS FIRST,
        COALESCE(t.updated_at_source, t.created_at_source, to_timestamp(0)) DESC,
        t.ticket_number DESC
      LIMIT ${this.maxTicketsPerAppointmentsRun}
    `;
    return rows
      .map((row) => Number(row.ticket_number))
      .filter((id) => Number.isFinite(id) && id > 0);
  }

  private async syncTicketAppointments(): Promise<void> {
    const entity = 'ticket_appointments';
    await this.upsertState({ entityName: entity, status: 'running', lastPage: 1 });

    try {
      const ticketNumbers = await this.listTicketsNeedingAppointmentsSync();
      let processed = 0;

      for (const ticketNumber of ticketNumbers) {
        const appointmentsByExternalId = new Map<number, TifluxSyncAppointment>();

        for (
          let page = 1;
          page <= this.maxAppointmentPagesPerTicket;
          page += 1
        ) {
          const path = this.buildPath(`/tickets/${ticketNumber}/appointments`, {
            limit: this.pageLimit,
            offset: page,
          });
          const data = await this.tifluxService.requestResource(path);
          const items = Array.isArray(data)
            ? (data as TifluxSyncAppointment[])
            : [];
          if (items.length === 0) break;

          for (const item of items) {
            const externalId = Number(item?.id);
            if (!Number.isFinite(externalId) || externalId <= 0) continue;
            appointmentsByExternalId.set(externalId, item);
          }

          if (items.length < this.pageLimit) break;
        }

        const syncedAt = new Date();
        const externalIds = Array.from(appointmentsByExternalId.keys());

        for (const [externalId, a] of appointmentsByExternalId.entries()) {
          const appointmentDate = this.toValidDateOrNull(a?.date);
          const initTimeRaw = String(a?.init_time ?? '').trim();
          const endTimeRaw = String(a?.end_time ?? '').trim();
          const initTime =
            initTimeRaw && /^\d{2}:\d{2}(:\d{2})?$/.test(initTimeRaw)
              ? `${initTimeRaw.length === 5 ? `${initTimeRaw}:00` : initTimeRaw}`
              : null;
          const endTime =
            endTimeRaw && /^\d{2}:\d{2}(:\d{2})?$/.test(endTimeRaw)
              ? `${endTimeRaw.length === 5 ? `${endTimeRaw}:00` : endTimeRaw}`
              : null;

          await this.prisma.$executeRawUnsafe(
            `
            INSERT INTO tiflux.ticket_appointments (
              id,
              ticket_number,
              external_id,
              client_external_id,
              client_name,
              appointment_date,
              description,
              init_time,
              end_time,
              user_external_id,
              user_name,
              valorization_raw,
              locations_raw,
              raw_json,
              synced_at,
              created_at,
              updated_at
            ) VALUES (
              gen_random_uuid(),
              $1,
              $2,
              $3,
              $4,
              $5::date,
              $6,
              $7::time,
              $8::time,
              $9,
              $10,
              $11::jsonb,
              $12::jsonb,
              $13::jsonb,
              $14::timestamptz,
              now(),
              now()
            )
            ON CONFLICT (ticket_number, external_id) DO UPDATE SET
              client_external_id = EXCLUDED.client_external_id,
              client_name = EXCLUDED.client_name,
              appointment_date = EXCLUDED.appointment_date,
              description = EXCLUDED.description,
              init_time = EXCLUDED.init_time,
              end_time = EXCLUDED.end_time,
              user_external_id = EXCLUDED.user_external_id,
              user_name = EXCLUDED.user_name,
              valorization_raw = EXCLUDED.valorization_raw,
              locations_raw = EXCLUDED.locations_raw,
              raw_json = EXCLUDED.raw_json,
              synced_at = EXCLUDED.synced_at,
              updated_at = now();
            `,
            ticketNumber,
            externalId,
            Number(a?.client?.id ?? NaN) || null,
            String(a?.client?.name ?? '').trim() || null,
            appointmentDate ? appointmentDate.toISOString().slice(0, 10) : null,
            String(a?.description ?? '').trim() || null,
            initTime,
            endTime,
            Number(a?.user?.id ?? NaN) || null,
            String(a?.user?.name ?? '').trim() || null,
            JSON.stringify(a?.valorization ?? null),
            JSON.stringify(a?.locations ?? null),
            JSON.stringify(a ?? null),
            syncedAt.toISOString(),
          );
        }

        if (externalIds.length > 0) {
          const notInIds = externalIds
            .map((id) => Number(id))
            .filter((id) => Number.isFinite(id) && id > 0)
            .join(',');
          await this.prisma.$executeRawUnsafe(
            `
            DELETE FROM tiflux.ticket_appointments
            WHERE ticket_number = $1
              AND external_id NOT IN (${notInIds})
            `,
            ticketNumber,
          );
        } else {
          await this.prisma.$executeRaw`
            DELETE FROM tiflux.ticket_appointments
            WHERE ticket_number = ${ticketNumber}
          `;
        }

        await this.prisma.$executeRaw`
          UPDATE tiflux.tickets
          SET appointments_synced_at = ${syncedAt}, updated_at = now()
          WHERE ticket_number = ${ticketNumber}
        `;

        processed += 1;
        await this.upsertState({
          entityName: entity,
          status: 'running',
          lastPage: processed,
        });
      }

      await this.upsertState({
        entityName: entity,
        status: 'ok',
        lastPage: processed,
      });
    } catch (error) {
      await this.upsertState({
        entityName: entity,
        status: 'error',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
