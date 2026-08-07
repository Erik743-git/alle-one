/**
 * k6 — smoke/load Alle One (rotas reais autenticadas)
 *
 * Fluxo por VU:
 *  1) login 1x (cookie `alleone_access`) — evita throttle 10/min
 *  2) GET /api/auth/me
 *  3) GET /api/tickets (+ catalogs/filters)
 *  4) GET /api/gmuds (+ companies)
 *  5) GET /api/dashboard/complete (se ZABBIX_GROUP ou COMPANY_ID+group resolvido)
 *
 * Uso (teste — não rode carga pesada em produção):
 *
 *   k6 run deploy/load/k6-alleone-smoke.js \
 *     -e BASE_URL=https://alleone-teste.alletecnologia.com \
 *     -e USER_EMAIL=voce@alletecnologia.com \
 *     -e USER_PASSWORD='***' \
 *     -e ZABBIX_GROUP='Nome do grupo Zabbix' \
 *     -e COMPANY_ID=uuid-opcional \
 *     -e VUS=5 \
 *     -e DURATION=2m
 *
 * 2FA: se a conta exige TOTP, passe -e TOTP_CODE=123456
 *
 * Instalar k6: https://grafana.com/docs/k6/latest/set-up/install-k6/
 */
import http from 'k6/http';
import { check, fail, group, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE_URL = String(__ENV.BASE_URL || '').replace(/\/$/, '');
const API = `${BASE_URL}/api`;
const USER_EMAIL = __ENV.USER_EMAIL || '';
const USER_PASSWORD = __ENV.USER_PASSWORD || '';
const TOTP_CODE = __ENV.TOTP_CODE || '';
const ZABBIX_GROUP = __ENV.ZABBIX_GROUP || '';
const COMPANY_ID = __ENV.COMPANY_ID || '';
const VUS = Number(__ENV.VUS || 5);
const DURATION = __ENV.DURATION || '2m';

const loginFail = new Rate('alleone_login_fail');
const authedFail = new Rate('alleone_authed_fail');
const dashboardMs = new Trend('alleone_dashboard_ms', true);
const ticketsMs = new Trend('alleone_tickets_ms', true);
const gmudMs = new Trend('alleone_gmud_ms', true);

export const options = {
  vus: Number.isFinite(VUS) && VUS > 0 ? VUS : 5,
  duration: DURATION,
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<3000'],
    alleone_login_fail: ['rate<0.01'],
    alleone_authed_fail: ['rate<0.05'],
  },
};

function requireEnv() {
  if (!BASE_URL) fail('Defina BASE_URL (ex.: https://alleone-teste.alletecnologia.com)');
  if (!USER_EMAIL || !USER_PASSWORD) {
    fail('Defina USER_EMAIL e USER_PASSWORD');
  }
}

function isoDateDaysAgo(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function jsonHeaders() {
  return { 'Content-Type': 'application/json', Accept: 'application/json' };
}

/**
 * Login uma vez por VU. k6 guarda Set-Cookie no jar do VU.
 * @returns {{ companyId: string|null, ok: boolean }}
 */
function ensureSession(state) {
  if (state.loggedIn) return state;

  const payload = {
    email: USER_EMAIL,
    password: USER_PASSWORD,
  };
  if (TOTP_CODE) payload.totpCode = TOTP_CODE;

  const res = http.post(`${API}/auth/login`, JSON.stringify(payload), {
    headers: jsonHeaders(),
    tags: { name: 'POST /api/auth/login' },
  });

  let body = null;
  try {
    body = res.json();
  } catch (_) {
    body = null;
  }

  const requires2fa = Boolean(body && (body.requires2fa || body.requires2FA));
  if (requires2fa && !TOTP_CODE) {
    loginFail.add(1);
    fail(
      'Conta exige 2FA. Rode de novo com -e TOTP_CODE=xxxxxx (código atual do autenticador).',
    );
  }

  const ok = check(res, {
    'login status 200/201': (r) => r.status === 200 || r.status === 201,
    'login não exige 2FA sem código': () => !requires2fa || Boolean(TOTP_CODE),
  });
  loginFail.add(ok ? 0 : 1);
  if (!ok) {
    fail(`login falhou HTTP ${res.status}: ${String(res.body).slice(0, 300)}`);
  }

  // Cookie alleone_access deve estar no jar. Confirma com /me.
  const me = http.get(`${API}/auth/me`, {
    headers: { Accept: 'application/json' },
    tags: { name: 'GET /api/auth/me' },
  });
  const meOk = check(me, { 'auth/me 200': (r) => r.status === 200 });
  authedFail.add(meOk ? 0 : 1);
  if (!meOk) {
    fail(`auth/me falhou HTTP ${me.status} — cookie de sessão não aceito?`);
  }

  let meBody = null;
  try {
    meBody = me.json();
  } catch (_) {
    meBody = null;
  }

  state.loggedIn = true;
  state.companyId =
    COMPANY_ID ||
    (meBody && (meBody.companyId || meBody.user?.companyId)) ||
    null;
  return state;
}

function hitTickets(state) {
  group('tickets', () => {
    const list = http.get(`${API}/tickets?limit=50`, {
      headers: { Accept: 'application/json' },
      tags: { name: 'GET /api/tickets' },
    });
    ticketsMs.add(list.timings.duration);
    const ok = check(list, { 'tickets list 200': (r) => r.status === 200 });
    authedFail.add(ok ? 0 : 1);

    const catalogs = http.get(`${API}/tickets/catalogs/filters`, {
      headers: { Accept: 'application/json' },
      tags: { name: 'GET /api/tickets/catalogs/filters' },
    });
    check(catalogs, {
      'tickets catalogs 200': (r) => r.status === 200,
    });

    // Detalhe do 1º ticket (se houver)
    try {
      const data = list.json();
      const groups = Array.isArray(data)
        ? data
        : Array.isArray(data?.groups)
          ? data.groups
          : Array.isArray(data?.items)
            ? data.items
            : [];
      let ticketNumber = null;
      for (const g of groups) {
        const tickets = Array.isArray(g?.tickets)
          ? g.tickets
          : Array.isArray(g?.items)
            ? g.items
            : Array.isArray(g)
              ? g
              : [];
        const first = tickets[0] || g;
        const n =
          first?.ticketNumber ??
          first?.ticket_number ??
          first?.number ??
          null;
        if (n != null) {
          ticketNumber = n;
          break;
        }
      }
      if (ticketNumber != null) {
        const detail = http.get(`${API}/tickets/${ticketNumber}`, {
          headers: { Accept: 'application/json' },
          tags: { name: 'GET /api/tickets/:number' },
        });
        check(detail, {
          'ticket detail 200': (r) => r.status === 200,
        });
      }
    } catch (_) {
      /* ignore parse */
    }
  });
}

function hitGmud(state) {
  group('gmud', () => {
    const qs = state.companyId
      ? `?companyId=${encodeURIComponent(state.companyId)}`
      : '';
    const list = http.get(`${API}/gmuds${qs}`, {
      headers: { Accept: 'application/json' },
      tags: { name: 'GET /api/gmuds' },
    });
    gmudMs.add(list.timings.duration);
    const ok = check(list, { 'gmuds list 200': (r) => r.status === 200 });
    authedFail.add(ok ? 0 : 1);

    const companies = http.get(`${API}/gmuds/companies`, {
      headers: { Accept: 'application/json' },
      tags: { name: 'GET /api/gmuds/companies' },
    });
    check(companies, {
      'gmuds companies 200': (r) => r.status === 200,
    });

    try {
      const data = list.json();
      const items = Array.isArray(data)
        ? data
        : Array.isArray(data?.items)
          ? data.items
          : Array.isArray(data?.data)
            ? data.data
            : [];
      const first = items[0];
      const id = first?.id;
      if (id) {
        const detail = http.get(`${API}/gmuds/${id}`, {
          headers: { Accept: 'application/json' },
          tags: { name: 'GET /api/gmuds/:id' },
        });
        check(detail, { 'gmud detail 200': (r) => r.status === 200 });
      }
    } catch (_) {
      /* ignore */
    }
  });
}

function hitDashboard(state) {
  const groupName = ZABBIX_GROUP;
  if (!groupName) {
    // Sem grupo Zabbix o endpoint exige `group` — pula com aviso uma vez.
    if (!state.warnedDashboard) {
      console.warn(
        '[k6] Dashboard pulado: defina -e ZABBIX_GROUP="..." (nome do grupo Zabbix da empresa).',
      );
      state.warnedDashboard = true;
    }
    return;
  }

  group('dashboard', () => {
    const start = isoDateDaysAgo(30);
    const end = isoDateDaysAgo(0);
    const params = new URLSearchParams();
    params.set('group', groupName);
    params.set('start', start);
    params.set('end', end);
    params.set('includeHours', 'true');
    params.set('includeCharts', 'true');
    if (state.companyId) params.set('companyId', state.companyId);

    const res = http.get(`${API}/dashboard/complete?${params.toString()}`, {
      headers: { Accept: 'application/json' },
      tags: { name: 'GET /api/dashboard/complete' },
    });
    dashboardMs.add(res.timings.duration);
    const ok = check(res, {
      'dashboard complete 200': (r) => r.status === 200,
    });
    authedFail.add(ok ? 0 : 1);
  });
}

export function setup() {
  requireEnv();
  const health = http.get(`${API}/health`, {
    tags: { name: 'GET /api/health' },
  });
  check(health, { 'health 200': (r) => r.status === 200 });
  return {
    startedAt: new Date().toISOString(),
  };
}

/** Estado por VU (cada VU tem runtime JS isolado no k6). */
const vuState = {
  loggedIn: false,
  companyId: null,
  warnedDashboard: false,
};

export default function () {
  ensureSession(vuState);
  hitTickets(vuState);
  hitGmud(vuState);
  hitDashboard(vuState);

  sleep(Number(__ENV.SLEEP || 1));
}
