/**
 * Migração final TiFlux → portal (desligamento definitivo).
 *
 * Por que existe: o alleone-tiflux-sync incremental perde mudanças (janela de
 * data com deslocamento de fuso), então o espelho `tiflux.*` fica desatualizado
 * — tickets fechados/reatribuídos no TiFlux seguem abertos no espelho. Este
 * script busca DIRETO da API do TiFlux e atualiza o espelho; depois o ETL
 * existente (cutover-final-sync.ts) copia espelho → portal.
 *
 * Grava no schema `tiflux`, com duas exceções que exigem --apply:
 * apply-appointments (deixa os apontamentos do portal iguais ao TiFlux,
 * protegendo usuários) e activate-auto-open-rules.
 *
 * Uso (na VM, em /home/alleone/producao/backend):
 *   npx ts-node prisma/scripts/cutover-tiflux-final.ts check
 *   npx ts-node prisma/scripts/cutover-tiflux-final.ts refresh-users
 *   npx ts-node prisma/scripts/cutover-tiflux-final.ts refresh-tickets
 *   npx ts-node prisma/scripts/cutover-tiflux-final.ts refresh-appointments --since=2026-05-01 --dry-run
 *   npx ts-node prisma/scripts/cutover-tiflux-final.ts refresh-appointments --since=2026-05-01
 *   npx ts-node prisma/scripts/cutover-tiflux-final.ts refresh-appointments --since=2026-05-01 --skip-synced-after=2026-09-15T16:00:00Z
 *
 * Token/URL: usa TIFLUX_TOKEN e TIFLUX_API_URL do ambiente; se ausentes, lê de
 * --sync-env=<arquivo> (padrão: /home/alleone/producao/alleone-tiflux-sync/.env).
 *
 * Logs: --log-dir=<dir> (padrão ./cutover-logs). Apontamentos que o TiFlux
 * apagou são gravados lá ANTES de saírem do espelho (o portal os mantém).
 */
import 'dotenv/config';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient, TicketAutoOpenPeriodicity } from '@prisma/client';
import {
  advanceScheduledDate,
  formatYmdUtc,
  parseRuleDueAt,
} from '../../src/modules/admin/ticket-auto-open.helper';
import { DEFAULT_COMPANY_PACK_MODULES } from '../../src/modules/permissions/company-pack.constants';

const prisma = new PrismaClient();

const PAGE_LIMIT = 200;
const MIN_INTERVAL_MS = Number(process.env.TIFLUX_MIN_REQUEST_INTERVAL_MS ?? 1300);

function arg(name: string): string | null {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

const logDir = arg('log-dir') ?? join(process.cwd(), 'cutover-logs');
if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });

function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  appendFileSync(join(logDir, 'cutover-tiflux-final.log'), `${line}\n`);
}

function loadApiConfig(): { base: string; token: string } {
  let token = process.env.TIFLUX_TOKEN?.trim() ?? '';
  let base = (process.env.TIFLUX_BASE_URL ?? process.env.TIFLUX_API_URL ?? '').trim();
  if (!token) {
    const envPath =
      arg('sync-env') ?? '/home/alleone/producao/alleone-tiflux-sync/.env';
    if (!existsSync(envPath)) {
      throw new Error(`TIFLUX_TOKEN ausente e ${envPath} não existe.`);
    }
    for (const raw of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = raw.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const value = m[2].replace(/^["']|["']$/g, '');
      if (m[1] === 'TIFLUX_TOKEN') token = value;
      if (!base && (m[1] === 'TIFLUX_BASE_URL' || m[1] === 'TIFLUX_API_URL')) base = value;
    }
  }
  if (!token) throw new Error('TIFLUX_TOKEN não encontrado.');
  return { base: (base || 'https://api.tiflux.com/api/v2').replace(/\/$/, ''), token };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let lastRequestAt = 0;

/** GET com espaçamento mínimo e retentativa em 429/5xx/rede. Nunca devolve resposta parcial. */
async function apiGet(
  path: string,
  params: Record<string, string | number> = {},
): Promise<{ data: unknown; total: number | null }> {
  const { base, token } = api;
  const qs = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)]),
  ).toString();
  const url = `${base}${path}${qs ? `?${qs}` : ''}`;

  for (let attempt = 1; attempt <= 8; attempt++) {
    const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(60_000),
      });
      if (res.status === 429 || res.status >= 500) {
        const backoff = Math.min(60_000, 2_000 * 2 ** (attempt - 1));
        log(`HTTP ${res.status} em ${path} — tentativa ${attempt}, aguardando ${backoff / 1000}s`);
        await sleep(backoff);
        continue;
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} em ${path}: ${(await res.text()).slice(0, 200)}`);
      }
      const totalHeader = res.headers.get('x-total-items');
      return {
        data: await res.json(),
        total: totalHeader != null && totalHeader !== '' ? Number(totalHeader) : null,
      };
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('HTTP ')) throw err;
      const backoff = Math.min(60_000, 2_000 * 2 ** (attempt - 1));
      log(`Falha de rede em ${path} (${String(err)}) — tentativa ${attempt}, aguardando ${backoff / 1000}s`);
      await sleep(backoff);
    }
  }
  throw new Error(`Desisti após 8 tentativas: ${path}`);
}

async function fetchAllPages(
  path: string,
  params: Record<string, string | number>,
  onPage?: (rows: any[], page: number, total: number | null) => Promise<void>,
): Promise<any[]> {
  const all: any[] = [];
  for (let page = 1; ; page++) {
    const { data, total } = await apiGet(path, { ...params, limit: PAGE_LIMIT, offset: page });
    if (!Array.isArray(data)) {
      throw new Error(`Resposta inesperada em ${path} página ${page} (não é lista).`);
    }
    if (onPage) await onPage(data, page, total);
    else all.push(...data);
    if (data.length < PAGE_LIMIT) break;
  }
  return all;
}

const eta = (done: number, total: number, startedAt: number) => {
  if (done === 0) return '?';
  const secs = ((Date.now() - startedAt) / done) * (total - done) / 1000;
  return secs > 3600 ? `${(secs / 3600).toFixed(1)}h` : `${Math.ceil(secs / 60)}min`;
};

// ---------------------------------------------------------------- users

async function fetchTifluxUsers(): Promise<any[]> {
  return fetchAllPages('/users', {});
}

async function refreshUsers() {
  const users = await fetchTifluxUsers();
  const rows = users
    .filter((u) => Number.isFinite(Number(u?.id)))
    .map((u) => ({
      external_id: Number(u.id),
      name: u?.name ?? null,
      email: u?.email ?? null,
      type: u?.type ?? u?.user_type ?? null,
      active: typeof u?.active === 'boolean' ? u.active : null,
      raw_json: u,
    }));
  await prisma.$executeRawUnsafe(
    `
    INSERT INTO tiflux.users (external_id, name, email, type, active, raw_json, synced_at, updated_at)
    SELECT r.external_id, left(r.name, 255), left(r.email, 255), left(r.type, 30), r.active, r.raw_json, now(), now()
    FROM jsonb_to_recordset($1::jsonb) AS r(external_id int, name text, email text, type text, active boolean, raw_json jsonb)
    ON CONFLICT (external_id) DO UPDATE SET
      name = EXCLUDED.name, email = EXCLUDED.email, type = EXCLUDED.type,
      active = EXCLUDED.active, raw_json = EXCLUDED.raw_json, synced_at = now(), updated_at = now()
    `,
    JSON.stringify(rows),
  );
  await prisma.$executeRawUnsafe(
    `UPDATE tiflux.sync_state SET last_success_at = now(), status = 'ok', updated_at = now() WHERE entity_name = 'users'`,
  );
  log(`Usuários TiFlux atualizados no espelho: ${rows.length}`);
}

// ---------------------------------------------------------------- tickets

async function refreshTickets() {
  const startedAt = Date.now();
  let written = 0;
  let expected: number | null = null;
  await fetchAllPages('/tickets', { filter_by: 'all' }, async (list, page, total) => {
    if (total != null) expected = total;
    const rows = list
      .filter((t) => Number.isFinite(Number(t?.ticket_number)))
      .map((t) => ({
        ticket_number: Number(t.ticket_number),
        client_external_id: t?.client?.id ?? null,
        client_name: t?.client?.name ?? null,
        desk_external_id: t?.desk?.id ?? null,
        desk_name: t?.desk?.name ?? null,
        created_at_source: t?.created_at ?? null,
        updated_at_source: t?.updated_at ?? null,
        is_closed: typeof t?.is_closed === 'boolean' ? t.is_closed : null,
        title: t?.title ?? null,
        priority_external_id: t?.priority?.id ?? null,
        priority_name: t?.priority?.name ?? null,
        status_external_id: t?.status?.id ?? null,
        status_name: t?.status?.name ?? null,
        stage_external_id: t?.stage?.id ?? null,
        stage_name: t?.stage?.name ?? null,
        responsible_external_id: t?.responsible?.id ?? null,
        responsible_name: t?.responsible?.name ?? null,
        requestor_external_id: t?.requestor?.id ?? null,
        requestor_email: t?.requestor?.email ?? null,
        requestor_name: t?.requestor?.name ?? null,
        requestor_ramal: t?.requestor?.ramal ?? null,
        requestor_telephone: t?.requestor?.telephone ?? null,
        services_catalog_raw: t?.services_catalog ?? null,
        sla_info_raw: t?.sla_info ?? null,
        raw_json: t,
      }));
    await prisma.$executeRawUnsafe(
      `
      INSERT INTO tiflux.tickets (
        ticket_number, client_external_id, client_name, desk_external_id, desk_name,
        created_at_source, updated_at_source, is_closed, title,
        priority_external_id, priority_name, status_external_id, status_name,
        stage_external_id, stage_name, responsible_external_id, responsible_name,
        requestor_external_id, requestor_email, requestor_name, requestor_ramal, requestor_telephone,
        services_catalog_raw, sla_info_raw, raw_json, synced_at, updated_at
      )
      SELECT
        r.ticket_number, r.client_external_id, left(r.client_name, 255), r.desk_external_id, left(r.desk_name, 255),
        r.created_at_source, r.updated_at_source, r.is_closed, r.title,
        r.priority_external_id, left(r.priority_name, 100), r.status_external_id, left(r.status_name, 100),
        r.stage_external_id, left(r.stage_name, 100), r.responsible_external_id, left(r.responsible_name, 255),
        r.requestor_external_id, left(r.requestor_email, 255), left(r.requestor_name, 255),
        left(r.requestor_ramal, 50), left(r.requestor_telephone, 50),
        r.services_catalog_raw, r.sla_info_raw, r.raw_json, now(), now()
      FROM jsonb_to_recordset($1::jsonb) AS r(
        ticket_number int, client_external_id int, client_name text, desk_external_id int, desk_name text,
        created_at_source timestamptz, updated_at_source timestamptz, is_closed boolean, title text,
        priority_external_id int, priority_name text, status_external_id int, status_name text,
        stage_external_id int, stage_name text, responsible_external_id int, responsible_name text,
        requestor_external_id int, requestor_email text, requestor_name text, requestor_ramal text, requestor_telephone text,
        services_catalog_raw jsonb, sla_info_raw jsonb, raw_json jsonb
      )
      ON CONFLICT (ticket_number) DO UPDATE SET
        client_external_id = EXCLUDED.client_external_id, client_name = EXCLUDED.client_name,
        desk_external_id = EXCLUDED.desk_external_id, desk_name = EXCLUDED.desk_name,
        created_at_source = EXCLUDED.created_at_source, updated_at_source = EXCLUDED.updated_at_source,
        is_closed = EXCLUDED.is_closed, title = EXCLUDED.title,
        priority_external_id = EXCLUDED.priority_external_id, priority_name = EXCLUDED.priority_name,
        status_external_id = EXCLUDED.status_external_id, status_name = EXCLUDED.status_name,
        stage_external_id = EXCLUDED.stage_external_id, stage_name = EXCLUDED.stage_name,
        responsible_external_id = EXCLUDED.responsible_external_id, responsible_name = EXCLUDED.responsible_name,
        requestor_external_id = EXCLUDED.requestor_external_id, requestor_email = EXCLUDED.requestor_email,
        requestor_name = EXCLUDED.requestor_name, requestor_ramal = EXCLUDED.requestor_ramal,
        requestor_telephone = EXCLUDED.requestor_telephone,
        services_catalog_raw = EXCLUDED.services_catalog_raw, sla_info_raw = EXCLUDED.sla_info_raw,
        raw_json = EXCLUDED.raw_json, synced_at = now(), updated_at = now()
      `,
      JSON.stringify(rows),
    );
    written += rows.length;
    const totalPages = expected != null ? Math.ceil(expected / PAGE_LIMIT) : null;
    if (page % 10 === 0 || list.length < PAGE_LIMIT) {
      log(
        `Tickets: página ${page}${totalPages ? `/${totalPages}` : ''} — ${written} gravados` +
          (totalPages ? ` — faltam ~${eta(page, totalPages, startedAt)}` : ''),
      );
    }
  });

  const [{ c: mirror }] = await prisma.$queryRawUnsafe<Array<{ c: number }>>(
    'SELECT count(*)::int AS c FROM tiflux.tickets',
  );
  log(`Tickets concluído: API informou ${expected ?? '?'}, gravados ${written}, espelho tem ${mirror}.`);
  if (expected != null && written < expected) {
    log(`ATENÇÃO: gravados (${written}) < total da API (${expected}). Rode refresh-tickets de novo.`);
    process.exitCode = 2;
  }
}

// ---------------------------------------------------------------- appointments

async function refreshAppointments() {
  const since = arg('since');
  if (!since || !/^\d{4}-\d{2}-\d{2}$/.test(since)) {
    throw new Error('Informe --since=AAAA-MM-DD (tickets alterados a partir desta data).');
  }
  const skipAfter = arg('skip-synced-after');
  const limit = arg('limit') ? Number(arg('limit')) : null;

  const tickets = await prisma.$queryRawUnsafe<Array<{ ticket_number: number }>>(
    `
    SELECT t.ticket_number
    FROM tiflux.tickets t
    WHERE (
        t.updated_at_source >= $1::date
        OR t.appointments_synced_at IS NULL
        OR t.appointments_synced_at < t.updated_at_source
        OR EXISTS (SELECT 1 FROM portal_tickets p WHERE p.ticket_number = t.ticket_number AND p.is_closed = false)
      )
      AND ($2::timestamptz IS NULL OR t.appointments_synced_at IS NULL OR t.appointments_synced_at < $2::timestamptz)
    ORDER BY t.updated_at_source DESC NULLS LAST
    `,
    since,
    skipAfter,
  );
  const queue = limit ? tickets.slice(0, limit) : tickets;
  const estSecs = (queue.length * MIN_INTERVAL_MS) / 1000;
  log(
    `Apontamentos: ${queue.length} tickets na fila (since=${since}${skipAfter ? `, pulando sincronizados após ${skipAfter}` : ''}). ` +
      `Estimativa mínima: ${(estSecs / 3600).toFixed(1)}h.`,
  );
  if (flag('dry-run')) return;

  const removedLog = join(logDir, 'apontamentos-removidos-no-tiflux.jsonl');
  const startedAt = Date.now();
  let upserts = 0;
  let removed = 0;

  for (let i = 0; i < queue.length; i++) {
    const ticketNumber = Number(queue[i].ticket_number);
    const list = await fetchAllPages(`/tickets/${ticketNumber}/appointments`, {});
    const rows = list
      .filter((a) => Number(a?.id) > 0)
      .map((a) => ({
        external_id: Number(a.id),
        client_external_id: a?.client?.id ?? null,
        client_name: a?.client?.name ?? null,
        appointment_date: a?.date ?? null,
        description: a?.description ?? null,
        init_time: a?.init_time ?? null,
        end_time: a?.end_time ?? null,
        user_external_id: a?.user?.id ?? null,
        user_name: a?.user?.name ?? null,
        valorization_raw: a?.valorization ?? null,
        locations_raw: a?.locations ?? null,
        raw_json: a,
      }));
    const ids = rows.map((r) => r.external_id);

    const gone = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
      `SELECT * FROM tiflux.ticket_appointments WHERE ticket_number = $1 AND NOT (external_id = ANY($2::int[]))`,
      ticketNumber,
      ids,
    );
    for (const row of gone) {
      appendFileSync(removedLog, `${JSON.stringify({ removedAt: new Date().toISOString(), ...row })}\n`);
    }

    await prisma.$transaction([
      prisma.$executeRawUnsafe(
        `
        INSERT INTO tiflux.ticket_appointments (
          ticket_number, external_id, client_external_id, client_name, appointment_date, description,
          init_time, end_time, user_external_id, user_name, valorization_raw, locations_raw, raw_json,
          synced_at, updated_at
        )
        SELECT $1, r.external_id, r.client_external_id, left(r.client_name, 255), r.appointment_date::date, r.description,
          r.init_time::time, r.end_time::time, r.user_external_id, left(r.user_name, 255),
          r.valorization_raw, r.locations_raw, r.raw_json, now(), now()
        FROM jsonb_to_recordset($2::jsonb) AS r(
          external_id int, client_external_id int, client_name text, appointment_date text, description text,
          init_time text, end_time text, user_external_id int, user_name text,
          valorization_raw jsonb, locations_raw jsonb, raw_json jsonb
        )
        ON CONFLICT (ticket_number, external_id) DO UPDATE SET
          client_external_id = EXCLUDED.client_external_id, client_name = EXCLUDED.client_name,
          appointment_date = EXCLUDED.appointment_date, description = EXCLUDED.description,
          init_time = EXCLUDED.init_time, end_time = EXCLUDED.end_time,
          user_external_id = EXCLUDED.user_external_id, user_name = EXCLUDED.user_name,
          valorization_raw = EXCLUDED.valorization_raw, locations_raw = EXCLUDED.locations_raw,
          raw_json = EXCLUDED.raw_json, synced_at = now(), updated_at = now()
        `,
        ticketNumber,
        JSON.stringify(rows),
      ),
      prisma.$executeRawUnsafe(
        `DELETE FROM tiflux.ticket_appointments WHERE ticket_number = $1 AND NOT (external_id = ANY($2::int[]))`,
        ticketNumber,
        ids,
      ),
      prisma.$executeRawUnsafe(
        `UPDATE tiflux.tickets SET appointments_synced_at = now() WHERE ticket_number = $1`,
        ticketNumber,
      ),
    ]);

    upserts += rows.length;
    removed += gone.length;
    if ((i + 1) % 50 === 0 || i + 1 === queue.length) {
      log(
        `Apontamentos: ${i + 1}/${queue.length} tickets — ${upserts} gravados, ${removed} removidos no TiFlux — faltam ~${eta(i + 1, queue.length, startedAt)}`,
      );
    }
  }
  await prisma.$executeRawUnsafe(
    `UPDATE tiflux.sync_state SET last_success_at = now(), status = 'ok', updated_at = now() WHERE entity_name = 'ticket_appointments'`,
  );
  log(`Apontamentos concluído. Removidos pelo TiFlux registrados em ${removedLog}`);
}

// ---------------------------------------------------------------- check

async function check() {
  const report: Record<string, unknown> = { geradoEm: new Date().toISOString() };
  const q = <T>(sql: string, ...params: unknown[]) =>
    prisma.$queryRawUnsafe<T[]>(sql, ...params);
  const section = (title: string, rows: unknown[]) => {
    report[title] = rows;
    console.log(`\n== ${title} (${rows.length}) ==`);
    if (rows.length) console.table(rows.slice(0, 60));
    if (rows.length > 60) console.log(`... +${rows.length - 60} no JSON`);
  };

  const { total: apiTickets } = await apiGet('/tickets', { filter_by: 'all', limit: 1, offset: 1 });
  const [{ c: mirrorTickets }] = await q<{ c: number }>('SELECT count(*)::int AS c FROM tiflux.tickets');
  section('1. Total de tickets: API x espelho', [
    { api: apiTickets, espelho: mirrorTickets, diferenca: apiTickets == null ? '?' : apiTickets - mirrorTickets },
  ]);

  const apiUsers = await fetchTifluxUsers();
  const apiUserById = new Map<number, { name: string | null; email: string | null }>(
    apiUsers.map((u) => [Number(u.id), { name: u?.name ?? null, email: u?.email ?? null }]),
  );
  const portalUsers = await q<{ id: string; name: string; email: string; status: string }>(
    'SELECT id, name, email, status::text AS status FROM users WHERE deleted_at IS NULL',
  );
  const norm = (s: string | null | undefined) =>
    (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
  const portalByEmail = new Map(portalUsers.map((u) => [norm(u.email), u]));
  const portalByName = new Map(portalUsers.map((u) => [norm(u.name), u]));

  const techs = await q<{
    user_external_id: number | null; user_name: string | null; apontamentos: number;
    horas: number; ultimo: string | null;
  }>(`
    SELECT user_external_id, max(user_name) AS user_name, count(*)::int AS apontamentos,
      round(sum(GREATEST(EXTRACT(EPOCH FROM (end_time - init_time)), 0)) / 3600.0, 1)::float AS horas,
      max(appointment_date)::text AS ultimo
    FROM tiflux.ticket_appointments GROUP BY user_external_id`);
  section(
    '2. Técnicos com apontamento SEM usuário no portal (as horas iriam para "não mapeados")',
    techs
      .map((t) => {
        const apiUser = t.user_external_id != null ? apiUserById.get(Number(t.user_external_id)) : undefined;
        const email = apiUser?.email ?? null;
        const byEmail = email ? portalByEmail.get(norm(email)) : undefined;
        if (byEmail) return null;
        return {
          tiflux_id: t.user_external_id,
          nome: apiUser?.name ?? t.user_name,
          email_tiflux: email,
          apontamentos: t.apontamentos,
          horas: t.horas,
          ultimo: t.ultimo,
          usuario_com_mesmo_nome:
            portalByName.get(norm(apiUser?.name ?? t.user_name))?.email ?? null,
        };
      })
      .filter((t): t is NonNullable<typeof t> => t !== null)
      .sort((a, b) => b.horas - a.horas),
  );

  const responsibles = await q<{ responsible_external_id: number | null; responsible_name: string; abertos: number }>(`
    SELECT responsible_external_id, responsible_name, count(*)::int AS abertos
    FROM tiflux.tickets WHERE COALESCE(is_closed, false) = false AND responsible_name IS NOT NULL
    GROUP BY 1, 2`);
  section(
    '3. Responsáveis de tickets abertos cujo nome não bate com usuário do portal ("meus tickets" fica vazio após desligar)',
    responsibles
      .filter((r) => !portalByName.has(norm(r.responsible_name)))
      .map((r) => {
        const email =
          r.responsible_external_id != null ? apiUserById.get(Number(r.responsible_external_id))?.email ?? null : null;
        const portal = email ? portalByEmail.get(norm(email)) : undefined;
        return {
          nome_no_tiflux: r.responsible_name,
          abertos: r.abertos,
          email_tiflux: email,
          usuario_portal_pelo_email: portal ? `${portal.name} <${portal.email}>` : null,
        };
      })
      .sort((a, b) => b.abertos - a.abertos),
  );

  section(
    '4. Clientes do TiFlux sem empresa no portal',
    await q(`
      SELECT t.client_external_id AS tiflux_client_id, max(t.client_name) AS cliente,
        count(*) FILTER (WHERE COALESCE(t.is_closed, false) = false)::int AS tickets_abertos,
        count(*)::int AS tickets_total
      FROM tiflux.tickets t
      WHERE t.client_external_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM companies c WHERE c.deleted_at IS NULL AND c.tiflux_client_id = t.client_external_id)
        AND NOT EXISTS (SELECT 1 FROM integration_tiflux_accounts a WHERE a.enabled AND a.tiflux_company_id = t.client_external_id::text)
      GROUP BY 1 ORDER BY 3 DESC, 4 DESC`),
  );

  section(
    '5. Mesas (catálogos) do TiFlux sem especialidade no portal',
    await q(`
      SELECT t.desk_external_id AS tiflux_desk_id, max(t.desk_name) AS mesa,
        count(*) FILTER (WHERE COALESCE(t.is_closed, false) = false)::int AS tickets_abertos,
        count(*)::int AS tickets_total
      FROM tiflux.tickets t
      WHERE t.desk_external_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM specialties s WHERE s.deleted_at IS NULL AND s.external_id = t.desk_external_id)
      GROUP BY 1 ORDER BY 3 DESC, 4 DESC`),
  );

  section(
    '6. Apontamentos cujo ticket não existe no espelho (ficariam órfãos)',
    await q(`
      SELECT a.ticket_number, count(*)::int AS apontamentos
      FROM tiflux.ticket_appointments a
      WHERE NOT EXISTS (SELECT 1 FROM tiflux.tickets t WHERE t.ticket_number = a.ticket_number)
      GROUP BY 1 ORDER BY 2 DESC`),
  );

  section(
    '7. O que o ETL ainda vai levar ao portal (deve zerar depois do ETL)',
    await q(`
      SELECT
        (SELECT count(*)::int FROM tiflux.tickets t WHERE NOT EXISTS (SELECT 1 FROM portal_tickets p WHERE p.ticket_number = t.ticket_number)) AS tickets_faltando,
        (SELECT count(*)::int FROM tiflux.tickets t JOIN portal_tickets p ON p.ticket_number = t.ticket_number
          WHERE COALESCE(t.is_closed, false) IS DISTINCT FROM p.is_closed
             OR t.responsible_external_id IS DISTINCT FROM p.responsible_external_id) AS tickets_divergentes,
        (SELECT count(*)::int FROM tiflux.ticket_appointments a WHERE NOT EXISTS (
          SELECT 1 FROM portal_ticket_appointments p WHERE p.tiflux_appointment_external_id = a.external_id)) AS apontamentos_faltando`),
  );

  section(
    '8. Apontamentos no portal que o TiFlux apagou (mantidos no portal — conferir duplicidade de horas)',
    await q(`
      SELECT p.ticket_number, p.appointment_date::text AS data, p.init_time, p.end_time, u.name AS tecnico, left(p.description, 60) AS descricao
      FROM portal_ticket_appointments p LEFT JOIN users u ON u.id = p.created_by
      WHERE p.tiflux_appointment_external_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM tiflux.ticket_appointments a WHERE a.external_id = p.tiflux_appointment_external_id)
      ORDER BY p.appointment_date DESC`),
  );

  section(
    '9. Frescor dos apontamentos no espelho',
    await q(`
      SELECT
        count(*) FILTER (WHERE appointments_synced_at IS NULL)::int AS nunca_sincronizados,
        count(*) FILTER (WHERE appointments_synced_at < updated_at_source)::int AS ticket_mudou_depois,
        count(*) FILTER (WHERE COALESCE(is_closed, false) = false AND (appointments_synced_at IS NULL OR appointments_synced_at < updated_at_source))::int AS abertos_desatualizados
      FROM tiflux.tickets`),
  );

  const file = join(logDir, `check-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(file, JSON.stringify(report, null, 2));
  log(`Relatório completo: ${file}`);
}

// ---------------------------------------------------------------- appointments → portal

/** Apontamentos destes usuários do portal não mudam de jeito nenhum na migração. */
const DEFAULT_PROTECTED_EMAILS = [
  'erik.manarin@alletecnologia.com',
  'alisson.ravizza@alletecnologia.com',
];

class DryRunRollback extends Error {}

/**
 * Deixa os apontamentos vindos do TiFlux IGUAIS ao espelho: insere os novos,
 * atualiza os alterados e apaga os que o TiFlux apagou. Substitui o passo de
 * apontamentos do ETL na virada (o ETL não apaga nem protege usuários).
 *
 * Nunca toca: apontamento criado no portal (sem id do TiFlux) e qualquer
 * apontamento dos usuários protegidos — nem quando o TiFlux mudou.
 * Sem --apply roda tudo numa transação e desfaz no fim (simulação real).
 */
async function applyAppointments() {
  const apply = flag('apply');
  const protectEmails = (arg('protect-emails') ?? DEFAULT_PROTECTED_EMAILS.join(','))
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  const protectedUsers = await prisma.user.findMany({
    where: { email: { in: protectEmails, mode: 'insensitive' }, deletedAt: null },
    select: { id: true, name: true, email: true },
  });
  const found = new Set(protectedUsers.map((u) => u.email.toLowerCase()));
  const missing = protectEmails.filter((e) => !found.has(e));
  if (missing.length) {
    throw new Error(`Usuário protegido não encontrado no portal: ${missing.join(', ')}. Nada foi feito.`);
  }
  log(`Protegidos (apontamentos intocados): ${protectedUsers.map((u) => `${u.name} <${u.email}>`).join('; ')}`);
  const protectedIds = protectedUsers.map((u) => u.id);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');

  try {
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(`
          CREATE TEMP TABLE cutover_mirror ON COMMIT DROP AS
          SELECT DISTINCT ON (a.external_id)
            a.external_id,
            a.ticket_number,
            COALESCE(a.appointment_date::date, CURRENT_DATE) AS appointment_date,
            COALESCE(to_char(a.init_time::time, 'HH24:MI'), '00:00') AS init_time,
            COALESCE(to_char(a.end_time::time, 'HH24:MI'), '00:00') AS end_time,
            NULLIF(trim(a.description), '') AS description,
            left(COALESCE(
              NULLIF(trim(a.valorization_raw #>> '{loose_service,name}'), ''),
              NULLIF(trim(a.valorization_raw #>> '{contract,name}'), ''),
              NULLIF(trim(a.valorization_raw #>> '{service,name}'), ''),
              NULLIF(trim(a.valorization_raw #>> '{name}'), '')
            ), 120) AS service_name,
            a.user_external_id,
            a.user_name,
            lower(trim(tu.email)) AS tiflux_email,
            (
              SELECT u.id FROM users u
              WHERE lower(trim(u.email)) = lower(trim(tu.email)) AND u.deleted_at IS NULL
              ORDER BY u.created_at ASC LIMIT 1
            ) AS portal_user_id
          FROM tiflux.ticket_appointments a
          LEFT JOIN tiflux.users tu ON tu.external_id = a.user_external_id AND NULLIF(trim(tu.email), '') IS NOT NULL
          WHERE a.external_id IS NOT NULL
          ORDER BY a.external_id, a.synced_at DESC
        `);

        const protectedMirror = `(m.portal_user_id = ANY($1::text[]) OR m.tiflux_email = ANY($2::text[]))`;

        const unmapped = await tx.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `
          SELECT m.user_external_id AS tiflux_id, max(m.user_name) AS tecnico, max(m.tiflux_email) AS email_tiflux, count(*)::int AS apontamentos
          FROM cutover_mirror m
          WHERE m.portal_user_id IS NULL AND NOT ${protectedMirror}
            AND (
              NOT EXISTS (SELECT 1 FROM portal_ticket_appointments p WHERE p.tiflux_appointment_external_id = m.external_id)
              OR EXISTS (SELECT 1 FROM portal_ticket_appointments p WHERE p.tiflux_appointment_external_id = m.external_id AND NOT (p.created_by = ANY($1::text[])))
            )
          GROUP BY 1 ORDER BY 4 DESC`,
          protectedIds,
          protectEmails,
        );
        if (unmapped.length && !flag('allow-unmapped')) {
          console.table(unmapped);
          throw new Error(
            `${unmapped.length} técnico(s) do TiFlux sem usuário no portal (tabela acima). Cadastre-os ou ajuste o e-mail e rode de novo. Nada foi gravado.`,
          );
        }

        const toDelete = await tx.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `
          SELECT p.*, u.name AS tecnico,
            (SELECT count(*)::int FROM portal_ticket_appointment_attachments x WHERE x.portal_appointment_id = p.id) AS anexos,
            (SELECT count(*)::int FROM project_activity_appointments x WHERE x.portal_appointment_id = p.id) AS vinculo_projeto,
            (SELECT json_agg(x) FROM portal_ticket_appointment_attachments x WHERE x.portal_appointment_id = p.id) AS anexos_json,
            (SELECT json_agg(x) FROM project_activity_appointments x WHERE x.portal_appointment_id = p.id) AS projeto_json,
            (SELECT json_agg(x) FROM portal_ticket_appointment_warning_acks x WHERE x.portal_appointment_id = p.id) AS avisos_json
          FROM portal_ticket_appointments p
          LEFT JOIN users u ON u.id = p.created_by
          WHERE p.tiflux_appointment_external_id IS NOT NULL
            AND NOT (p.created_by = ANY($1::text[]))
            AND NOT EXISTS (SELECT 1 FROM cutover_mirror m WHERE m.external_id = p.tiflux_appointment_external_id)
          ORDER BY p.appointment_date, p.init_time`,
          protectedIds,
        );

        const updateWhere = `
          FROM cutover_mirror m
          WHERE p.tiflux_appointment_external_id = m.external_id
            AND NOT (p.created_by = ANY($1::text[]))
            AND NOT ${protectedMirror}
            AND m.portal_user_id IS NOT NULL
            AND (
              p.ticket_number IS DISTINCT FROM m.ticket_number
              OR p.appointment_date IS DISTINCT FROM m.appointment_date
              OR p.init_time IS DISTINCT FROM m.init_time
              OR p.end_time IS DISTINCT FROM m.end_time
              OR p.description IS DISTINCT FROM COALESCE(m.description, p.description)
              OR p.service_name IS DISTINCT FROM COALESCE(m.service_name, p.service_name)
              OR p.created_by IS DISTINCT FROM m.portal_user_id
            )`;
        const toUpdate = await tx.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT p.id, p.tiflux_appointment_external_id,
             p.ticket_number AS antes_ticket, m.ticket_number AS depois_ticket,
             p.appointment_date AS antes_data, m.appointment_date AS depois_data,
             p.init_time AS antes_inicio, m.init_time AS depois_inicio,
             p.end_time AS antes_fim, m.end_time AS depois_fim,
             p.created_by AS antes_usuario, m.portal_user_id AS depois_usuario,
             p.service_name AS antes_servico, COALESCE(m.service_name, p.service_name) AS depois_servico,
             p.description AS antes_descricao
           FROM portal_ticket_appointments p ${updateWhere.replace('FROM cutover_mirror m', 'JOIN cutover_mirror m ON true')}`,
          protectedIds,
          protectEmails,
        );

        const insertWhere = `
          FROM cutover_mirror m
          WHERE NOT EXISTS (SELECT 1 FROM portal_ticket_appointments p WHERE p.tiflux_appointment_external_id = m.external_id)
            AND NOT ${protectedMirror}
            AND m.portal_user_id IS NOT NULL`;
        const [{ c: toInsert }] = await tx.$queryRawUnsafe<Array<{ c: number }>>(
          `SELECT count(*)::int AS c ${insertWhere}`,
          protectedIds,
          protectEmails,
        );

        const [protectedInfo] = await tx.$queryRawUnsafe<Array<Record<string, number>>>(
          `SELECT
            (SELECT count(*)::int FROM portal_ticket_appointments p WHERE p.created_by = ANY($1::text[]) AND p.tiflux_appointment_external_id IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM cutover_mirror m WHERE m.external_id = p.tiflux_appointment_external_id)) AS protegidos_apagados_no_tiflux_mantidos,
            (SELECT count(*)::int FROM cutover_mirror m WHERE NOT EXISTS (SELECT 1 FROM portal_ticket_appointments p WHERE p.tiflux_appointment_external_id = m.external_id)
               AND ${protectedMirror}) AS protegidos_novos_no_tiflux_nao_trazidos`,
          protectedIds,
          protectEmails,
        );

        const byTech = new Map<string, { excluir: number; horas_excluir: number }>();
        for (const row of toDelete) {
          const k = String(row.tecnico ?? '?');
          const cur = byTech.get(k) ?? { excluir: 0, horas_excluir: 0 };
          const [ih, im] = String(row.init_time).split(':').map(Number);
          const [eh, em] = String(row.end_time).split(':').map(Number);
          cur.excluir++;
          cur.horas_excluir += Math.max(0, eh * 60 + em - (ih * 60 + im)) / 60;
          byTech.set(k, cur);
        }

        console.log('\n== Apontamentos TiFlux → portal ==');
        console.table([
          {
            incluir: toInsert,
            alterar: toUpdate.length,
            excluir: toDelete.length,
            excluir_com_anexo: toDelete.filter((r) => Number(r.anexos) > 0).length,
            excluir_com_vinculo_projeto: toDelete.filter((r) => Number(r.vinculo_projeto) > 0).length,
            ...protectedInfo,
          },
        ]);
        if (toDelete.length) {
          console.log('\n-- A excluir, por técnico --');
          console.table(
            [...byTech.entries()].map(([tecnico, v]) => ({ tecnico, ...v, horas_excluir: Number(v.horas_excluir.toFixed(2)) })),
          );
        }

        const exportFile = join(logDir, `apontamentos-${apply ? 'aplicado' : 'simulacao'}-${stamp}.json`);
        writeFileSync(
          exportFile,
          JSON.stringify({ protegidos: protectedUsers, excluidos: toDelete, alterados_antes_depois: toUpdate }, null, 2),
        );
        log(`Cópia completa (excluídos com anexos/vínculos, e valores antes de alterar): ${exportFile}`);

        await tx.$executeRawUnsafe(
          `
          INSERT INTO portal_ticket_appointments (
            id, ticket_number, appointment_date, init_time, end_time, description,
            service_name, attendance, tiflux_appointment_external_id, sync_status,
            created_by, created_at, updated_at
          )
          SELECT gen_random_uuid()::text, m.ticket_number, m.appointment_date, m.init_time, m.end_time,
            COALESCE(m.description, '(sem descrição)'), COALESCE(m.service_name, 'HORA NORMAL'), 'Remote',
            m.external_id, 'SYNCED'::"PortalTicketAppointmentSyncStatus", m.portal_user_id, NOW(), NOW()
          ${insertWhere}`,
          protectedIds,
          protectEmails,
        );
        await tx.$executeRawUnsafe(
          `
          UPDATE portal_ticket_appointments p SET
            ticket_number = m.ticket_number,
            appointment_date = m.appointment_date,
            init_time = m.init_time,
            end_time = m.end_time,
            description = COALESCE(m.description, p.description),
            service_name = COALESCE(m.service_name, p.service_name),
            created_by = m.portal_user_id,
            sync_status = 'SYNCED'::"PortalTicketAppointmentSyncStatus",
            updated_at = NOW()
          ${updateWhere}`,
          protectedIds,
          protectEmails,
        );
        if (toDelete.length) {
          await tx.$executeRawUnsafe(
            `DELETE FROM portal_ticket_appointments WHERE id = ANY($1::text[])`,
            toDelete.map((r) => String(r.id)),
          );
        }

        if (!apply) throw new DryRunRollback();
      },
      { timeout: 30 * 60_000, maxWait: 60_000 },
    );
    log('Apontamentos aplicados no portal.');
  } catch (err) {
    if (err instanceof DryRunRollback) {
      log('Simulação: tudo foi executado e DESFEITO. Rode com --apply para gravar.');
      return;
    }
    throw err;
  }
}

// ---------------------------------------------------------------- companies

const normCompany = (s: string | null | undefined) =>
  (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\b(ltda|s\.?\/?a|me|epp|eireli|cia)\b\.?/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
const digits = (s: unknown) => String(s ?? '').replace(/\D/g, '');

/**
 * Liga os clientes do TiFlux às empresas do portal. O vínculo que o sistema usa
 * é companies.tiflux_client_id (integration_tiflux_accounts não é lida em lugar
 * nenhum). Antes de criar, procura a empresa por CNPJ e por nome normalizado.
 *
 * Só age sozinho quando não há dúvida: um candidato forte (mesmo CNPJ ou mesmo
 * nome) ainda sem ID do TiFlux → liga; nenhum candidato → cria. Conflitos e
 * semelhanças fracas ficam listados. Para decidir um caso na mão:
 * --link=<tiflux_client_id>:<company_id> (repetível, separado por vírgula).
 */
async function linkCompanies() {
  const apply = flag('apply');
  const forced = new Map(
    (arg('link') ?? '')
      .split(',')
      .filter(Boolean)
      .map((pair) => {
        const [tid, cid] = pair.split(':');
        return [Number(tid), cid] as const;
      }),
  );

  const missing = await prisma.$queryRawUnsafe<Array<{ id: number; nome: string | null; abertos: number; total: number }>>(`
    SELECT t.client_external_id AS id, max(t.client_name) AS nome,
      count(*) FILTER (WHERE COALESCE(t.is_closed, false) = false)::int AS abertos, count(*)::int AS total
    FROM tiflux.tickets t
    WHERE t.client_external_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM companies c WHERE c.deleted_at IS NULL AND c.tiflux_client_id = t.client_external_id)
    GROUP BY 1 ORDER BY 3 DESC, 4 DESC`);
  if (!missing.length) {
    log('Todos os clientes do TiFlux já estão ligados a uma empresa do portal.');
    return;
  }

  const apiClients = new Map<number, any>(
    (await fetchAllPages('/clients', {})).map((c) => [Number(c.id), c]),
  );
  const companies = await prisma.company.findMany({
    select: { id: true, name: true, tifluxClientName: true, cnpj: true, email: true, tifluxClientId: true, deletedAt: true },
  });
  const takenEmails = new Set(companies.map((c) => c.email.toLowerCase()));
  const takenCnpjs = new Set(companies.map((c) => digits(c.cnpj)).filter(Boolean));

  type Plan =
    | { kind: 'link'; tid: number; companyId: string; name: string }
    | { kind: 'create'; tid: number; name: string; social: string | null; email: string; cnpj: string | null };
  const plans: Plan[] = [];
  const rows: Array<Record<string, unknown>> = [];

  for (const m of missing) {
    const api = apiClients.get(Number(m.id));
    const tName: string = (api?.name ?? m.nome ?? `Cliente TiFlux ${m.id}`).trim();
    const tSocial: string | null = api?.social?.trim() || null;
    const tCnpj = digits(api?.document ?? api?.cnpj ?? api?.social_number ?? api?.cpf_cnpj);
    const names = [normCompany(tName), normCompany(tSocial)].filter(Boolean);

    const scored = companies
      .map((c) => {
        const cNames = [normCompany(c.name), normCompany(c.tifluxClientName)].filter(Boolean);
        const byCnpj = tCnpj.length >= 11 && digits(c.cnpj) === tCnpj;
        const byName = names.some((n) => cNames.some((cn) => cn.replace(/ /g, "") === n.replace(/ /g, "")));
        const weak =
          !byCnpj &&
          !byName &&
          names.some((n) => n.length >= 4 && cNames.some((cn) => cn.length >= 4 && (cn.includes(n) || n.includes(cn))));
        return { c, strong: byCnpj || byName, weak, how: byCnpj ? 'CNPJ' : byName ? 'nome' : 'parecido' };
      })
      .filter((x) => x.strong || x.weak);
    const describe = (x: (typeof scored)[number]) =>
      `${x.c.name} [${x.how}]${x.c.tifluxClientId ? ` (já ligada ao TiFlux ${x.c.tifluxClientId})` : ''}${x.c.deletedAt ? ' (EXCLUÍDA)' : ''} id=${x.c.id}`;

    const base = { tiflux_id: m.id, cliente_tiflux: tName, abertos: m.abertos, total: m.total };
    const forcedId = forced.get(Number(m.id));
    if (forcedId) {
      const target = companies.find((c) => c.id === forcedId && !c.deletedAt);
      if (!target) throw new Error(`--link: empresa ${forcedId} não existe ou está excluída.`);
      if (target.tifluxClientId) throw new Error(`--link: ${target.name} já está ligada ao TiFlux ${target.tifluxClientId}.`);
      plans.push({ kind: 'link', tid: m.id, companyId: target.id, name: target.name });
      rows.push({ ...base, acao: 'LIGAR (manual)', empresa_portal: target.name });
      continue;
    }

    const strongActive = scored.filter((x) => x.strong && !x.c.deletedAt);
    const free = strongActive.filter((x) => !x.c.tifluxClientId);
    if (strongActive.length === 1 && free.length === 1) {
      plans.push({ kind: 'link', tid: m.id, companyId: free[0].c.id, name: free[0].c.name });
      rows.push({ ...base, acao: 'LIGAR', empresa_portal: describe(free[0]) });
    } else if (strongActive.length > 0) {
      rows.push({ ...base, acao: 'DECIDIR: conflito ou mais de um candidato', empresa_portal: strongActive.map(describe).join(' | ') });
    } else if (scored.length > 0) {
      rows.push({ ...base, acao: 'DECIDIR: parecida (confirmar ou criar)', empresa_portal: scored.map(describe).join(' | ') });
    } else {
      const apiEmail = String(api?.email ?? '').trim().toLowerCase();
      const email =
        /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(apiEmail) && !takenEmails.has(apiEmail)
          ? apiEmail
          : `tiflux-${m.id}@sem-email.alletecnologia.internal`;
      const cnpj = tCnpj.length === 14 && !takenCnpjs.has(tCnpj) ? tCnpj : null;
      takenEmails.add(email);
      if (cnpj) takenCnpjs.add(cnpj);
      plans.push({ kind: 'create', tid: m.id, name: tName, social: tSocial, email, cnpj });
      rows.push({ ...base, acao: 'CRIAR', empresa_portal: `${tName} <${email}>${cnpj ? ` CNPJ ${cnpj}` : ' (sem CNPJ)'}` });
    }
  }

  console.log('\n== Clientes do TiFlux x empresas do portal ==');
  console.table(rows);
  writeFileSync(
    join(logDir, `empresas-${apply ? 'aplicado' : 'simulacao'}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`),
    JSON.stringify(rows, null, 2),
  );
  if (!apply) {
    log('Simulação: nada gravado. Rode com --apply para ligar/criar (casos DECIDIR ficam de fora).');
    return;
  }

  for (const p of plans) {
    if (p.kind === 'link') {
      const tName = (apiClients.get(p.tid)?.name ?? null) as string | null;
      await prisma.company.update({ where: { id: p.companyId }, data: { tifluxClientId: p.tid, tifluxClientName: tName } });
      log(`Ligada: ${p.name} ← TiFlux ${p.tid}`);
    } else {
      await prisma.$transaction(async (tx) => {
        const created = await tx.company.create({
          data: {
            name: p.name,
            responsibleName: p.social ?? p.name,
            email: p.email,
            cnpj: p.cnpj,
            tifluxClientId: p.tid,
            tifluxClientName: p.name,
            status: true,
          },
        });
        await tx.companyModule.createMany({
          data: DEFAULT_COMPANY_PACK_MODULES.map((module) => ({ companyId: created.id, module, enabled: true })),
          skipDuplicates: true,
        });
      });
      log(`Criada: ${p.name} (TiFlux ${p.tid}, e-mail ${p.email})`);
    }
  }
}

// ---------------------------------------------------------------- responsible names

/**
 * Com o TiFlux desligado, "meus tickets" casa o responsável pelo NOME do
 * usuário do portal. Tickets herdados do TiFlux trazem o nome como está lá
 * ("Erik Bramoski Manarin" x "Erik Manarin" no portal) e somem da fila.
 * Troca o nome do responsável pelo do cadastro do portal, casando o técnico do
 * TiFlux pelo e-mail. Rodar depois do ETL final e com o cron já removido, senão
 * o ETL devolve o nome do TiFlux. Sem --apply só lista.
 */
async function normalizeResponsibleNames() {
  const apply = flag('apply');
  const rows = await prisma.$queryRawUnsafe<Array<{ de: string | null; para: string; email: string; tickets: number; abertos: number }>>(`
    SELECT p.responsible_name AS de, u.name AS para, u.email, count(*)::int AS tickets,
      count(*) FILTER (WHERE p.is_closed = false)::int AS abertos
    FROM portal_tickets p
    JOIN tiflux.users tu ON tu.external_id = p.responsible_external_id AND NULLIF(trim(tu.email), '') IS NOT NULL
    JOIN users u ON lower(trim(u.email)) = lower(trim(tu.email)) AND u.deleted_at IS NULL
    WHERE p.responsible_name IS DISTINCT FROM u.name
    GROUP BY 1, 2, 3 ORDER BY 5 DESC, 4 DESC`);
  console.log('\n== Nomes de responsável a alinhar com o cadastro do portal ==');
  console.table(rows);
  if (!apply) {
    log(`Simulação: ${rows.reduce((s, r) => s + r.tickets, 0)} tickets teriam o nome do responsável ajustado. Rode com --apply.`);
    return;
  }
  const n = await prisma.$executeRawUnsafe(`
    UPDATE portal_tickets p SET responsible_name = u.name, updated_at = NOW()
    FROM tiflux.users tu
    JOIN users u ON lower(trim(u.email)) = lower(trim(tu.email)) AND u.deleted_at IS NULL
    WHERE tu.external_id = p.responsible_external_id
      AND NULLIF(trim(tu.email), '') IS NOT NULL
      AND p.responsible_name IS DISTINCT FROM u.name`);
  log(`Nome do responsável ajustado em ${n} tickets.`);
}

// ---------------------------------------------------------------- auto-open rules

/**
 * Religa as rotinas de abertura automática desligadas. ÚNICO comando que grava
 * numa tabela do portal. Sem --apply só mostra o que faria.
 *
 * O job abre o chamado da data agendada e avança UM período por execução, a
 * cada minuto. Religar uma rotina diária parada em junho abriria um chamado por
 * minuto para cada dia perdido. Por isso a próxima data é empurrada para a
 * primeira ocorrência futura antes de ativar — nenhum atraso é "pago".
 */
async function activateAutoOpenRules() {
  const apply = flag('apply');
  const now = new Date();
  const rules = await prisma.ticketAutoOpenRule.findMany({
    where: { active: false, deletedAt: null },
    orderBy: { name: 'asc' },
  });

  const clientIds = new Set(
    (
      await prisma.$queryRawUnsafe<Array<{ id: number }>>(`
        SELECT tiflux_client_id AS id FROM companies WHERE deleted_at IS NULL AND tiflux_client_id IS NOT NULL
        UNION SELECT tiflux_company_id::int FROM integration_tiflux_accounts WHERE enabled AND tiflux_company_id ~ '^[0-9]+$'`)
    ).map((r) => Number(r.id)),
  );
  const deskIds = new Set(
    (
      await prisma.specialty.findMany({
        where: { deletedAt: null, externalId: { not: null } },
        select: { externalId: true },
      })
    ).map((s) => Number(s.externalId)),
  );

  const companyByClient = new Map(
    (
      await prisma.company.findMany({
        where: { deletedAt: null, tifluxClientId: { not: null } },
        select: { tifluxClientId: true, name: true },
      })
    ).map((c) => [Number(c.tifluxClientId), c.name]),
  );
  const excludeRaw = (arg('exclude') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const excludeIds = new Set(excludeRaw.map((s) => s.toLowerCase()));
  const excludes = excludeRaw.map((s) => normCompany(s)).filter(Boolean);

  const toActivate: Array<{ id: string; next: Date; resetFailures: boolean }> = [];
  const rows: Array<Record<string, unknown>> = [];

  for (const rule of rules) {
    const base = {
      rotina: rule.name,
      cliente: companyByClient.get(rule.clientExternalId) ?? `TiFlux ${rule.clientExternalId}`,
      id: rule.id,
      periodicidade: rule.periodicity,
      proxima_hoje_no_banco: `${formatYmdUtc(rule.nextScheduledDate)} ${rule.scheduleTime}`,
      ultima_execucao: rule.lastRunAt?.toISOString().slice(0, 16) ?? null,
      ultimo_erro: rule.lastError?.slice(0, 80) ?? null,
    };
    const cadastro = [
      clientIds.has(rule.clientExternalId) ? null : 'cliente sem empresa no portal',
      deskIds.has(rule.deskExternalId) ? null : 'catálogo sem especialidade no portal',
    ]
      .filter(Boolean)
      .join('; ');

    const ruleName = normCompany(rule.name);
    if (excludeIds.has(rule.id.toLowerCase()) || excludes.some((e) => ruleName.includes(e))) {
      rows.push({ ...base, acao: 'EXCLUÍDA por --exclude', cadastro });
      continue;
    }

    if (rule.periodicity === TicketAutoOpenPeriodicity.ONCE) {
      const due = parseRuleDueAt(rule);
      if (rule.lastRunAt) {
        rows.push({ ...base, acao: 'IGNORADA: uso único que já rodou (religar abriria de novo)', cadastro });
        continue;
      }
      if (due.getTime() <= now.getTime()) {
        rows.push({ ...base, acao: 'DECIDIR: uso único que nunca rodou e a data já passou', cadastro });
        continue;
      }
      toActivate.push({ id: rule.id, next: rule.nextScheduledDate, resetFailures: rule.consecutiveFailures > 0 });
      rows.push({ ...base, acao: 'ATIVAR', nova_proxima: base.proxima_hoje_no_banco, cadastro });
      continue;
    }

    let next = rule.nextScheduledDate;
    let skipped = 0;
    while (parseRuleDueAt({ nextScheduledDate: next, scheduleTime: rule.scheduleTime }).getTime() <= now.getTime()) {
      next = advanceScheduledDate(next, rule.periodicity);
      skipped++;
      if (skipped > 5000) throw new Error(`Rotina "${rule.name}": não achei data futura.`);
    }
    toActivate.push({ id: rule.id, next, resetFailures: rule.consecutiveFailures > 0 });
    rows.push({
      ...base,
      acao: 'ATIVAR',
      nova_proxima: `${formatYmdUtc(next)} ${rule.scheduleTime}`,
      ocorrencias_puladas: skipped,
      cadastro,
    });
  }

  console.log(`\n== Rotinas de abertura automática desligadas: ${rules.length} ==`);
  console.table(rows);
  const semCadastro = rows.filter((r) => r.acao === 'ATIVAR' && r.cadastro).length;
  log(
    `Rotinas: ${toActivate.length} a ativar (${semCadastro} com cadastro faltando — vão falhar até corrigir), ` +
      `${rows.length - toActivate.length} fora (ver coluna acao).`,
  );
  writeFileSync(
    join(logDir, `rotinas-${apply ? 'ativadas' : 'simulacao'}-${now.toISOString().replace(/[:.]/g, '-')}.json`),
    JSON.stringify(rows, null, 2),
  );

  if (!apply) {
    log('Simulação: nada gravado. Rode com --apply para ativar.');
    return;
  }
  await prisma.$transaction(
    toActivate.map((r) =>
      prisma.ticketAutoOpenRule.update({
        where: { id: r.id },
        data: {
          active: true,
          nextScheduledDate: r.next,
          ...(r.resetFailures ? { consecutiveFailures: 0 } : {}),
        },
      }),
    ),
  );
  log(`Ativadas ${toActivate.length} rotinas.`);
}

// ---------------------------------------------------------------- main

const api = loadApiConfig();

async function main() {
  const cmd = process.argv[2];
  log(`cutover-tiflux-final ${process.argv.slice(2).join(' ')}`);
  if (cmd === 'check') await check();
  else if (cmd === 'refresh-users') await refreshUsers();
  else if (cmd === 'refresh-tickets') await refreshTickets();
  else if (cmd === 'refresh-appointments') await refreshAppointments();
  else if (cmd === 'activate-auto-open-rules') await activateAutoOpenRules();
  else if (cmd === 'apply-appointments') await applyAppointments();
  else if (cmd === 'normalize-responsible-names') await normalizeResponsibleNames();
  else if (cmd === 'link-companies') await linkCompanies();
  // activate-auto-open-rules [--apply] [--exclude=<id ou trecho do nome>,...]
  else {
    console.log('Comandos: check | refresh-users | refresh-tickets | refresh-appointments --since=AAAA-MM-DD [--dry-run] [--skip-synced-after=ISO] [--limit=N] | apply-appointments [--apply] [--protect-emails=a,b] | activate-auto-open-rules [--apply]');
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    log(`ERRO: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
