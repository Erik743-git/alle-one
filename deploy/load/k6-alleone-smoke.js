/**
 * k6 — smoke/load Alle One (rotas reais autenticadas)
 *
 * Fluxo:
 *  1) setup(): health + login **1x** (cookie `alleone_access`) — evita throttle 10/min
 *  2) cada VU reutiliza o cookie do setup (sem novo login por iteração)
 *  3) GET /api/tickets (+ catalogs/filters)
 *  4) GET /api/gmuds (+ companies)
 *  5) GET /api/dashboard/complete (se ZABBIX_GROUP)
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

function authHeaders(accessCookie) {
  return {
    Accept: 'application/json',
    Cookie: `alleone_access=${accessCookie}`,
  };
}

function extractCookieValue(res, name) {
  const jarCookies = res.cookies && res.cookies[name];
  if (jarCookies) {
    const entry = Array.isArray(jarCookies) ? jarCookies[0] : jarCookies;
    if (entry && entry.value) return String(entry.value);
  }
  const raw = res.headers['Set-Cookie'] || res.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  for (const line of list) {
    const m = String(line).match(new RegExp(`${name}=([^;]+)`));
    if (m) return decodeURIComponent(m[1]);
  }
  return '';
}

function hitTickets(accessCookie) {
  group('tickets', () => {
    const list = http.get(`${API}/tickets?limit=50`, {
      headers: authHeaders(accessCookie),
      tags: { name: 'GET /api/tickets' },
    });
    ticketsMs.add(list.timings.duration);
    const ok = check(list, { 'tickets list 200': (r) => r.status === 200 });
    authedFail.add(ok ? 0 : 1);

    const catalogs = http.get(`${API}/tickets/catalogs/filters`, {
      headers: authHeaders(accessCookie),
      tags: { name: 'GET /api/tickets/catalogs/filters' },
    });
    check(catalogs, {
      'tickets catalogs 200': (r) => r.status === 200,
    });

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
          headers: authHeaders(accessCookie),
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

function hitGmud(accessCookie, companyId) {
  group('gmud', () => {
    const qs = companyId ? `?companyId=${encodeURIComponent(companyId)}` : '';
    const list = http.get(`${API}/gmuds${qs}`, {
      headers: authHeaders(accessCookie),
      tags: { name: 'GET /api/gmuds' },
    });
    gmudMs.add(list.timings.duration);
    const ok = check(list, { 'gmuds list 200': (r) => r.status === 200 });
    authedFail.add(ok ? 0 : 1);

    const companies = http.get(`${API}/gmuds/companies`, {
      headers: authHeaders(accessCookie),
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
          headers: authHeaders(accessCookie),
          tags: { name: 'GET /api/gmuds/:id' },
        });
        check(detail, { 'gmud detail 200': (r) => r.status === 200 });
      }
    } catch (_) {
      /* ignore */
    }
  });
}

function hitDashboard(accessCookie, companyId, state) {
  const groupName = ZABBIX_GROUP;
  if (!groupName) {
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
    if (companyId) params.set('companyId', companyId);

    const res = http.get(`${API}/dashboard/complete?${params.toString()}`, {
      headers: authHeaders(accessCookie),
      tags: { name: 'GET /api/dashboard/complete' },
    });
    dashboardMs.add(res.timings.duration);
    const ok = check(res, {
      'dashboard complete 200': (r) => r.status === 200,
    });
    authedFail.add(ok ? 0 : 1);
  });
}

/**
 * Login uma única vez no setup; VUs reutilizam o cookie.
 * Evita estourar rate-limit de login (ex.: 10/min).
 */
export function setup() {
  requireEnv();

  const health = http.get(`${API}/health`, {
    tags: { name: 'GET /api/health' },
  });
  check(health, { 'health 200': (r) => r.status === 200 });

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

  const accessCookie = extractCookieValue(res, 'alleone_access');
  if (!accessCookie) {
    loginFail.add(1);
    fail('Login OK mas cookie alleone_access não veio no Set-Cookie.');
  }

  const me = http.get(`${API}/auth/me`, {
    headers: authHeaders(accessCookie),
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

  const companyId =
    COMPANY_ID ||
    (meBody && (meBody.companyId || meBody.user?.companyId)) ||
    null;

  return {
    startedAt: new Date().toISOString(),
    accessCookie,
    companyId,
  };
}

/** Aviso de dashboard: uma vez por VU. */
const vuState = {
  warnedDashboard: false,
};

export default function (data) {
  if (!data || !data.accessCookie) {
    fail('setup não retornou accessCookie');
  }
  hitTickets(data.accessCookie);
  hitGmud(data.accessCookie, data.companyId);
  hitDashboard(data.accessCookie, data.companyId, vuState);

  sleep(Number(__ENV.SLEEP || 1));
}
